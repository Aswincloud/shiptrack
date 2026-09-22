import { NextRequest, NextResponse } from "next/server";
import { getEnv, type AppEnv } from "@/lib/env";
import {
  cancelGuestWatchesForPhone,
  cancelWatch,
  countGuestWatchesForPhoneSince,
  deleteWatchPhoneVerification,
  findActiveGuestWatchForPhone,
  findPhoneVerificationByCode,
  findWatchPhoneVerificationByCode,
  getUserByPhone,
  getWatch,
  linkUserPhone,
  linkWatchPhone,
  setWhatsappOptIn,
  MAX_GUEST_WATCHES_PER_PHONE_PER_DAY,
} from "@/lib/db";
import { getCarrier } from "@/carriers/registry";
import {
  isStartMessage,
  isStopMessage,
  parseInboundMessages,
  parseLinkCode,
  sendText,
  verifyWebhookSignature,
  whatsappConfigured,
  type InboundMessage,
} from "@/lib/whatsapp";

export const dynamic = "force-dynamic";

// Meta's webhook for our WhatsApp business number. Two jobs:
//
//   1. Linking. Settings hands a signed-in user a code; they send "VERIFY <code>"
//      to our number from WhatsApp; the message lands here with the sender's
//      number, which is bound to their account. The user never types a number,
//      so it can't be mistyped or someone else's.
//   2. Opt-out/in and replies. STOP turns alerts off for the sender's account,
//      START turns them back on, anything else is logged so the template's
//      "reply to this message" line actually reaches someone.
//
// Every POST is authenticated by X-Hub-Signature-256 (HMAC of the raw body
// with the app secret) — the endpoint is public, and an unsigned request could
// otherwise link any number to any pending code.
//
// Meta calls wa-relay (one callback URL per app), which forwards the raw body
// and signature header to every receiver of the number. Ours is the support
// number, shared with Chatwoot, so everything customers write to support also
// arrives here: act only on VERIFY/STOP/START, log the rest, and stay quiet
// on anything that could be a redelivery.

// GET: Meta's one-time subscription handshake. It sends its challenge and the
// verify token the operator pasted into the dashboard; echo the challenge back
// only when the token matches.
export async function GET(req: NextRequest) {
  const env = getEnv();
  const u = new URL(req.url);
  const mode = u.searchParams.get("hub.mode");
  const token = u.searchParams.get("hub.verify_token");
  const challenge = u.searchParams.get("hub.challenge");
  if (mode === "subscribe" && env.WHATSAPP_WEBHOOK_VERIFY_TOKEN && token === env.WHATSAPP_WEBHOOK_VERIFY_TOKEN && challenge) {
    return new Response(challenge, { status: 200, headers: { "content-type": "text/plain" } });
  }
  return new Response("forbidden", { status: 403 });
}

export async function POST(req: NextRequest) {
  const env = getEnv();
  if (!env.DB || !env.WHATSAPP_APP_SECRET) {
    return NextResponse.json({ error: "not_configured" }, { status: 503 });
  }

  // Signature is over the exact bytes Meta sent, so read raw first, parse after.
  const raw = await req.text();
  const signed = await verifyWebhookSignature(raw, req.headers.get("x-hub-signature-256"), env.WHATSAPP_APP_SECRET);
  if (!signed) return NextResponse.json({ error: "invalid_signature" }, { status: 401 });

  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  // A WABA can carry several numbers; only act on messages to ours.
  const messages = parseInboundMessages(payload).filter(
    (m) => !env.WHATSAPP_PHONE_NUMBER_ID || m.phoneNumberId === env.WHATSAPP_PHONE_NUMBER_ID,
  );
  for (const m of messages) {
    try {
      await handleInbound(env, m);
    } catch (err) {
      // Never let one message fail the batch — Meta would redeliver all of them.
      console.error(`whatsapp inbound ${m.id} from ${m.from} failed:`, err instanceof Error ? err.message : err);
    }
  }

  // Always 200 once authenticated: anything else makes Meta retry, and there
  // is nothing a retry would fix.
  return NextResponse.json({ ok: true });
}

async function handleInbound(env: AppEnv, m: InboundMessage): Promise<void> {
  if (m.text === null) {
    console.log(`whatsapp inbound ${m.type} from ${m.from} (ignored)`);
    return;
  }
  const text = m.text.trim();
  const now = Math.floor(Date.now() / 1000);

  // Link code first: it is the one message we actively asked the user to send.
  const code = parseLinkCode(text);
  if (code) {
    const v = await findPhoneVerificationByCode(env.DB, code, now);
    if (v) {
      await linkUserPhone(env.DB, v.user_id, m.from);
      console.log(`whatsapp linked ${m.from} to user ${v.user_id}`);
      await reply(
        env,
        m.from,
        "✅ WhatsApp connected to your ShipTrack account. You'll get a message here when a shipment is picked up, out for delivery, delivered, or runs into a problem. Reply STOP any time to turn these off.",
      );
      return;
    }
    // A guest "tell me when it appears" watch: the message is both the proof of
    // the number and the opt-in for this one shipment, so it goes straight to
    // active — no email, no confirmation link. Caps and duplicates are decided
    // here because this is the first moment we know the number.
    const wv = await findWatchPhoneVerificationByCode(env.DB, code, now);
    if (wv) {
      const w = await getWatch(env.DB, wv.watch_id);
      if (!w || w.status !== "pending") {
        await deleteWatchPhoneVerification(env.DB, wv.watch_id);
        return;
      }
      const shipment = `${getCarrier(w.carrier)?.name ?? w.carrier} ${w.tracking_number}`;
      const claimedToday = await countGuestWatchesForPhoneSince(env.DB, m.from, now - 24 * 60 * 60);
      if (claimedToday >= MAX_GUEST_WATCHES_PER_PHONE_PER_DAY) {
        await cancelWatch(env.DB, w.id);
        await deleteWatchPhoneVerification(env.DB, w.id);
        console.log(`whatsapp guest watch ${w.id} refused: ${m.from} at daily cap`);
        await reply(env, m.from, `This number already has ${MAX_GUEST_WATCHES_PER_PHONE_PER_DAY} shipment alerts today. Create a free ShipTrack account to watch more: ${env.APP_URL}`);
        return;
      }
      const dup = await findActiveGuestWatchForPhone(env.DB, m.from, w.carrier, w.tracking_number);
      if (dup) {
        await cancelWatch(env.DB, w.id);
        await deleteWatchPhoneVerification(env.DB, w.id);
        console.log(`whatsapp guest watch ${w.id} duplicate of ${dup.id} for ${m.from}`);
        await reply(env, m.from, `You're already getting WhatsApp updates for ${shipment} here.`);
        return;
      }
      const linked = await linkWatchPhone(env.DB, w.id, m.from);
      if (!linked) return; // lost a race with the sweep; nothing to say
      console.log(`whatsapp guest watch ${w.id} (${w.carrier}/${w.tracking_number}) linked to ${m.from}`);
      await reply(
        env,
        m.from,
        `✅ Watching ${shipment}. We'll message you here as soon as it appears, then when it's picked up, out for delivery, delivered, or runs into a problem. Reply STOP to stop.`,
      );
      return;
    }
    // Consumed or expired. If this number is already linked, the overwhelmingly
    // likely cause is the relay redelivering the very message that linked it
    // (Meta retries when any other receiver of our shared number was down) —
    // stay silent rather than tell a freshly-connected user their code failed.
    const already = await getUserByPhone(env.DB, m.from);
    if (already?.phone_verified_at) return;
    // Same for a guest watch the sender already claimed a moment ago.
    if ((await countGuestWatchesForPhoneSince(env.DB, m.from, now - 60 * 60)) > 0) return;
    await reply(env, m.from, "That code has expired or isn't valid. Go back to the tracking page (or ShipTrack → Settings) to get a fresh one.");
    return;
  }

  const user = await getUserByPhone(env.DB, m.from);

  if (isStopMessage(text)) {
    // Both kinds of alert this number could be getting: an account's linked
    // number, and guest watches claimed from a tracking page.
    if (user) await setWhatsappOptIn(env.DB, user.id, false);
    const stopped = await cancelGuestWatchesForPhone(env.DB, m.from);
    if (user || stopped > 0) {
      console.log(`whatsapp STOP from ${m.from}${user ? ` (user ${user.id})` : ""}${stopped ? ` — ${stopped} guest watch(es) cancelled` : ""}`);
      await reply(
        env,
        m.from,
        user
          ? "ShipTrack WhatsApp alerts are off. Reply START to turn them back on, or manage this in Settings."
          : "ShipTrack WhatsApp alerts are off for this number. To watch a shipment again, use Notify me on its tracking page.",
      );
    }
    return;
  }
  if (isStartMessage(text)) {
    if (user) {
      await setWhatsappOptIn(env.DB, user.id, true);
      console.log(`whatsapp START from ${m.from} (user ${user.id})`);
      await reply(env, m.from, "ShipTrack WhatsApp alerts are back on.");
    } else if ((await countGuestWatchesForPhoneSince(env.DB, m.from, 0)) > 0) {
      // Cancelled guest watches aren't revived — the shipment may be long
      // delivered — but tell them how to start a new one.
      await reply(env, m.from, `To get WhatsApp updates for a shipment again, open it at ${env.APP_URL} and tap Notify me.`);
    }
    return;
  }

  // A reply to an alert ("this tracking detail is wrong"), or an unrelated
  // message. Surface it in the worker logs; there is no inbox yet.
  console.log(`whatsapp reply from ${m.from}${user ? ` (user ${user.id})` : " (unknown number)"}: ${text.slice(0, 300)}`);
}

// In-window free-text reply. Best-effort: the linking/opt-out already happened.
async function reply(env: AppEnv, to: string, body: string): Promise<void> {
  if (!whatsappConfigured(env)) return;
  try {
    await sendText(env, to, body);
  } catch (err) {
    console.warn(`whatsapp reply to ${to} failed:`, err instanceof Error ? err.message : err);
  }
}
