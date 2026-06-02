import type { D1Database, ScheduledController, ExecutionContext } from "@cloudflare/workers-types";
import { listDueWatches, markPolled, recordEvent, purgeDeliveredWatches, type WatchRow } from "../../src/lib/db";
import { signToken } from "../../src/lib/tokens";
import { getCarrier } from "../../src/carriers/registry";
import { emailResend } from "../../src/notifiers/email-resend";
import { CarrierError } from "../../src/carriers/types";

interface Env {
  DB: D1Database;
  TOKEN_SECRET: string;
  RESEND_API_KEY: string;
  RESEND_FROM: string;
  APP_URL: string;
  DELHIVERY_API_TOKEN?: string;
}

const BATCH_SIZE = 50;
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
    await markPolled(env.DB, w.id);
    return;
  }

  let result;
  try {
    result = await carrier.track(w.tracking_number, { delhiveryToken: env.DELHIVERY_API_TOKEN });
  } catch (err) {
    const code = err instanceof CarrierError ? err.code : "unknown";
    console.warn(`poll failed for ${w.id} (${w.carrier}/${w.tracking_number}): ${code}`);
    await markPolled(env.DB, w.id);
    return;
  }

  const latest = result.events[result.events.length - 1];
  if (!latest) {
    await markPolled(env.DB, w.id, { lastKnownStatus: result.status });
    return;
  }

  const hash = await sha256Hex(`${latest.timestamp}|${latest.rawCode ?? ""}|${latest.description}`);
  if (hash === w.last_event_hash) {
    await markPolled(env.DB, w.id);
    return;
  }

  await recordEvent(env.DB, w.id, {
    status: latest.status,
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
        newStatus: latest.status,
        event: latest,
        unsubscribeUrl,
      },
    );
  } catch (err) {
    console.error(`notify failed for ${w.id}:`, err instanceof Error ? err.message : err);
  }

  const complete = TERMINAL.has(latest.status);
  await markPolled(env.DB, w.id, {
    lastKnownStatus: latest.status,
    lastEventHash: hash,
    complete,
  });
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

    const due = await listDueWatches(env.DB, now, BATCH_SIZE);
    if (due.length === 0) return;
    console.log(`polling ${due.length} watches`);
    const tasks = due.map((w) => processWatch(env, w).catch((e) => console.error(`watch ${w.id}:`, e)));
    ctx.waitUntil(Promise.allSettled(tasks).then(() => undefined));
  },
};
