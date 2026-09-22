import type { D1Database, ScheduledController, ExecutionContext } from "@cloudflare/workers-types";
import {
  cancelWatch,
  listDueWatches,
  markPolled,
  recordEvent,
  purgeDeliveredWatches,
  expireStalePendingGuestWatches,
  getUserById,
  CONFIRM_TTL_SECONDS,
  DEAD_WATCH_SECONDS,
  type WatchRow,
} from "../../src/lib/db";
import { sendEmail, watchExpiredEmail } from "../../src/lib/email";
import { signToken } from "../../src/lib/tokens";
import { getCarrier } from "../../src/carriers/registry";
import { emailResend } from "../../src/notifiers/email-resend";
import { whatsappMeta, WHATSAPP_MILESTONES } from "../../src/notifiers/whatsapp";
import { CarrierError } from "../../src/carriers/types";

interface Env {
  DB: D1Database;
  TOKEN_SECRET: string;
  RESEND_API_KEY: string;
  RESEND_FROM: string;
  APP_URL: string;
  DELHIVERY_API_TOKEN?: string;
  // WhatsApp alerts — optional; unset ⇒ never attempted.
  WHATSAPP_PHONE_NUMBER_ID?: string;
  WHATSAPP_ACCESS_TOKEN?: string;
  WHATSAPP_TEMPLATE_NAME?: string;
  WHATSAPP_TEMPLATE_LANG?: string;
  WHATSAPP_API_BASE?: string;
}

const BATCH_SIZE = 50;
// Simultaneous fetches per carrier. A tick used to fire every due watch at
// once — 50 parallel hits on one tracking page is exactly how the scrapers get
// rate-limited, and one 429 then fails every watch in the batch.
const MAX_CONCURRENCY_PER_CARRIER = 5;
const TERMINAL = new Set(["delivered", "returned"]);
// Delivered/returned watches are purged this long after completion.
const PURGE_GRACE_SECONDS = 7 * 24 * 60 * 60;

async function sha256Hex(input: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function processWatch(env: Env, w: WatchRow): Promise<void> {
  const carrier = getCarrier(w.carrier);
  if (!carrier) {
    // The poller is deployed separately from the web app (`npm run
    // deploy:poller`), so a carrier added to the registry is live on the site
    // while this worker still has the old bundle. That combination silently
    // stamps last_polled_at and leaves last_known_status null — the dashboard
    // shows "awaiting first scan" forever and no alerts fire. Log it loudly.
    console.warn(
      `watch ${w.id} references unknown carrier "${w.carrier}" — this poller bundle predates it; redeploy the poller.`,
    );
    await markPolled(env.DB, w.id);
    return;
  }

  // A watch that has never produced a scan after DEAD_WATCH_SECONDS is a
  // mistyped AWB or a shipment that was never booked. Stop polling it (as a
  // cancellation — the dashboard already renders that state) and tell the
  // owner once. Checked after the carrier lookup so a poller bundle that
  // merely predates the carrier can never retire a legitimate watch.
  const now = Math.floor(Date.now() / 1000);
  const since = w.confirmed_at ?? w.created_at;
  if (w.last_known_status === null && now - since >= DEAD_WATCH_SECONDS) {
    await expireDeadWatch(env, w);
    return;
  }

  let result;
  try {
    result = await carrier.track(w.tracking_number, { delhiveryToken: env.DELHIVERY_API_TOKEN });
  } catch (err) {
    const code = err instanceof CarrierError ? err.code : "unknown";
    // Bump poll_failures so listDueWatches() backs this watch off exponentially
    // (up to 24h at the 15-minute minimum) instead of re-fetching every tick.
    console.warn(
      `poll failed for ${w.id} (${w.carrier}/${w.tracking_number}): ${code} — failure #${w.poll_failures + 1}, backing off`,
    );
    await markPolled(env.DB, w.id, { pollOutcome: "failed" });
    return;
  }

  // The carrier can revise the expected delivery date without adding a scan, so
  // refresh it on every successful poll rather than only on a status change.
  const eta = result.estimatedDelivery;

  const latest = result.events[result.events.length - 1];
  if (!latest) {
    // Some carriers (notably ST Courier) surface a terminal state through their
    // summary "Current Status" cell even when the scan timeline parses to zero
    // events — e.g. an older delivered shipment whose detailed scans the carrier
    // has since dropped. Only result.status carries it on this path, so run the
    // terminal check off that. Without it the watch stays 'active' forever: it
    // never moves to the dashboard's "Delivered" section and keeps polling.
    //
    // Don't store "unknown" as the status here: the never-scanned fast window
    // and the dead-watch check both key off last_known_status IS NULL, and the
    // dashboard reads NULL as "awaiting first scan". A carrier page with a
    // result panel but no scans yet (Blue Dart does this) would otherwise flip
    // the row to the string "unknown" and silently drop it out of all three.
    await markPolled(env.DB, w.id, {
      ...(result.status !== "unknown" ? { lastKnownStatus: result.status } : {}),
      estimatedDelivery: eta,
      complete: TERMINAL.has(result.status),
      pollOutcome: "ok",
    });
    return;
  }

  // The carrier's overall verdict (newest *known* scan, then its summary) is
  // what the API and site show; use the same thing here so the dashboard can't
  // disagree with the public track page. latest.status alone reads "unknown"
  // whenever the newest scan is a remark the carrier mapper doesn't recognise.
  const status = result.status !== "unknown" ? result.status : latest.status;

  const hash = await sha256Hex(`${latest.timestamp}|${latest.rawCode ?? ""}|${latest.description}`);
  if (hash === w.last_event_hash) {
    // No new scan since last poll. Still re-affirm terminality so a watch that
    // reached a terminal status without ever being marked complete (a pre-fix
    // row, or one first seen via the no-event path above) self-heals instead of
    // polling indefinitely. markPolled only flips status when complete is true.
    // Likewise re-affirm the status itself, silently (no email): a mapper fix
    // that turns a stored "unknown" into "in_transit" should reach the
    // dashboard without waiting for the carrier to add a scan.
    await markPolled(env.DB, w.id, {
      estimatedDelivery: eta,
      complete: TERMINAL.has(status),
      pollOutcome: "ok",
      ...(status !== "unknown" && status !== w.last_known_status ? { lastKnownStatus: status } : {}),
    });
    return;
  }

  await recordEvent(env.DB, w.id, {
    status,
    description: latest.description,
    location: latest.location,
    timestamp: latest.timestamp,
  });

  const unsubToken = await signToken(env.TOKEN_SECRET, w.id, "unsubscribe");
  const unsubscribeUrl = `${env.APP_URL.replace(/\/$/, "")}/api/watches/unsubscribe?token=${encodeURIComponent(unsubToken)}`;

  try {
    await emailResend.send(
      { RESEND_API_KEY: env.RESEND_API_KEY, RESEND_FROM: env.RESEND_FROM, APP_URL: env.APP_URL },
      {
        to: w.email,
        watch: w,
        oldStatus: w.last_known_status,
        newStatus: status,
        event: latest,
        estimatedDelivery: eta ?? w.estimated_delivery,
        unsubscribeUrl,
      },
    );
  } catch (err) {
    console.error(`notify failed for ${w.id}:`, err instanceof Error ? err.message : err);
  }

  // WhatsApp rides alongside email for the watch's owner, on milestones only
  // (WHATSAPP_MILESTONES): it is billed per message and interrupts a phone, so
  // in-transit hops stay email-only. Requires a linked, verified, opted-in
  // number on the owning account; guest watches have no owner and never
  // qualify. Failure here must never affect the email or the poll bookkeeping.
  if (w.user_id && WHATSAPP_MILESTONES.has(status) && env.WHATSAPP_PHONE_NUMBER_ID && env.WHATSAPP_ACCESS_TOKEN) {
    try {
      const owner = await getUserById(env.DB, w.user_id);
      if (owner?.phone && owner.phone_verified_at && owner.whatsapp_opt_in === 1) {
        await whatsappMeta.send(env, {
          to: owner.phone,
          recipientName: owner.name,
          watch: w,
          oldStatus: w.last_known_status,
          newStatus: status,
          event: latest,
          estimatedDelivery: eta ?? w.estimated_delivery,
          unsubscribeUrl,
        });
      }
    } catch (err) {
      console.error(`whatsapp notify failed for ${w.id}:`, err instanceof Error ? err.message : err);
    }
  }

  const complete = TERMINAL.has(status);
  await markPolled(env.DB, w.id, {
    lastKnownStatus: status,
    lastEventHash: hash,
    estimatedDelivery: eta,
    complete,
    pollOutcome: "ok",
  });
}

async function expireDeadWatch(env: Env, w: WatchRow): Promise<void> {
  const days = Math.round(DEAD_WATCH_SECONDS / 86400);
  console.warn(`watch ${w.id} (${w.carrier}/${w.tracking_number}) has had no scan in ${days} days — retiring it`);
  // cancelWatch() is a no-op if the user cancelled it meanwhile; only mail on
  // the actual transition so nobody gets this twice.
  const changed = await cancelWatch(env.DB, w.id);
  if (!changed) return;
  try {
    const msg = watchExpiredEmail({
      appUrl: env.APP_URL.replace(/\/$/, ""),
      carrier: w.carrier,
      trackingNumber: w.tracking_number,
      label: w.label,
      days,
    });
    await sendEmail(
      { RESEND_API_KEY: env.RESEND_API_KEY, RESEND_FROM: env.RESEND_FROM, APP_URL: env.APP_URL },
      { to: w.email, ...msg },
    );
  } catch (err) {
    console.error(`expiry notice failed for ${w.id}:`, err instanceof Error ? err.message : err);
  }
}

// Run `fn` over `items` with at most `limit` in flight. Errors are the
// caller's to catch inside `fn`; a rejection here would only stall one lane.
async function runPool<T>(items: T[], limit: number, fn: (item: T) => Promise<void>): Promise<void> {
  let next = 0;
  const lanes = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const item = items[next++];
      await fn(item);
    }
  });
  await Promise.allSettled(lanes);
}

export default {
  async scheduled(_event: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    const now = Math.floor(Date.now() / 1000);

    // Sweep delivered/returned watches past their grace window. Best-effort —
    // a failure here must never block the polling run.
    ctx.waitUntil(
      purgeDeliveredWatches(env.DB, now, PURGE_GRACE_SECONDS)
        .then((n) => {
          if (n > 0) console.log(`purged ${n} delivered watches`);
        })
        .catch((e) => console.error("purge failed:", e instanceof Error ? e.message : e)),
    );

    // Retire guest requests whose confirmation link expired unclicked. Same
    // best-effort footing as the purge.
    ctx.waitUntil(
      expireStalePendingGuestWatches(env.DB, now, CONFIRM_TTL_SECONDS)
        .then((n) => {
          if (n > 0) console.log(`expired ${n} unconfirmed guest watches`);
        })
        .catch((e) => console.error("guest expiry sweep failed:", e instanceof Error ? e.message : e)),
    );

    const due = await listDueWatches(env.DB, now, BATCH_SIZE);
    if (due.length === 0) return;
    console.log(`polling ${due.length} watches`);

    // Carriers run in parallel with each other; within a carrier at most
    // MAX_CONCURRENCY_PER_CARRIER fetches are in flight at once.
    const byCarrier = new Map<string, WatchRow[]>();
    for (const w of due) {
      const group = byCarrier.get(w.carrier);
      if (group) group.push(w);
      else byCarrier.set(w.carrier, [w]);
    }
    const lanes = [...byCarrier.values()].map((group) =>
      runPool(group, MAX_CONCURRENCY_PER_CARRIER, (w) =>
        processWatch(env, w).catch((e) => console.error(`watch ${w.id}:`, e)),
      ),
    );
    ctx.waitUntil(Promise.allSettled(lanes).then(() => undefined));
  },
};
