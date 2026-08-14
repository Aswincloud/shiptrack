import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getEnv } from "@/lib/env";
import {
  cancelWatch,
  createWatch,
  confirmWatch,
  countOpenWatchesForUser,
  getUserById,
  MAX_OPEN_WATCHES_PER_USER,
  MIN_POLL_INTERVAL_SECONDS,
  MAX_POLL_INTERVAL_SECONDS,
} from "@/lib/db";
import { getCarrier } from "@/carriers/registry";
import { readSession } from "@/lib/auth";
import { signToken } from "@/lib/tokens";
import { sendEmail, watchCreatedEmail, confirmEmail } from "@/lib/email";

export const dynamic = "force-dynamic";

// How long a third-party confirmation link stays good for.
const CONFIRM_TTL_SECONDS = 7 * 24 * 60 * 60;

const Body = z.object({
  email: z.string().email().max(254),
  carrier: z.string().min(1).max(32),
  trackingNumber: z.string().min(4).max(40),
  label: z.string().max(80).optional(),
  pollIntervalSeconds: z
    .number()
    .int()
    .min(MIN_POLL_INTERVAL_SECONDS)
    .max(MAX_POLL_INTERVAL_SECONDS)
    .optional(),
});

export async function POST(req: NextRequest) {
  const env = getEnv();
  if (!env.DB || !env.TOKEN_SECRET) {
    return NextResponse.json({ error: "not_configured" }, { status: 503 });
  }

  // Auth: prefer session cookie. Fall back to ADMIN_TOKEN bearer for legacy /
  // owner curl flow. One of the two must succeed.
  //
  // `selfEmail` is the requester's own verified address, and stays null for the
  // ADMIN_TOKEN path — that token is the operator's own credential, so their
  // curl flow keeps activating watches outright.
  const session = await readSession(env.TOKEN_SECRET, req);
  let userId: string | null = null;
  let selfEmail: string | null = null;
  if (session) {
    const user = await getUserById(env.DB, session.userId);
    if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    userId = user.id;
    selfEmail = user.email.toLowerCase();
  } else {
    const auth = req.headers.get("authorization") ?? "";
    const provided = auth.startsWith("Bearer ") ? auth.slice(7) : "";
    if (!env.ADMIN_TOKEN || !provided || provided !== env.ADMIN_TOKEN) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
  }

  const json = await req.json().catch(() => null);
  const parsed = Body.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_input", details: parsed.error.flatten() }, { status: 400 });
  }
  const { email, carrier, trackingNumber, label } = parsed.data;

  if (!getCarrier(carrier)) {
    return NextResponse.json({ error: "carrier_not_supported" }, { status: 400 });
  }

  const cleanedEmail = email.toLowerCase();
  const cleanedCarrier = carrier.toLowerCase();
  const cleanedTracking = trackingNumber.trim();
  const cleanedLabel = label ?? null;

  if (userId) {
    const open = await countOpenWatchesForUser(env.DB, userId);
    if (open >= MAX_OPEN_WATCHES_PER_USER) {
      return NextResponse.json(
        {
          error: "watch_limit_reached",
          message: `You can watch up to ${MAX_OPEN_WATCHES_PER_USER} shipments at a time. Cancel one to add another.`,
        },
        { status: 429 },
      );
    }
  }

  // A watch may only mail an address that has agreed to hear from us. Your own
  // account address is self-evidently consented; anyone else's has to click a
  // confirmation link before the poller will alert it — otherwise an account
  // could point watches at strangers and use ShipTrack to mail them.
  const needsConfirmation = selfEmail !== null && cleanedEmail !== selfEmail;

  const mailConfigured = !!(env.RESEND_API_KEY && env.RESEND_FROM);
  if (needsConfirmation && !mailConfigured) {
    // No way to deliver the confirmation, so the watch could never activate.
    return NextResponse.json({ error: "not_configured" }, { status: 503 });
  }

  const id = crypto.randomUUID();
  await createWatch(env.DB, {
    id,
    userId,
    email: cleanedEmail,
    carrier: cleanedCarrier,
    trackingNumber: cleanedTracking,
    label: cleanedLabel,
    pollIntervalSeconds: parsed.data.pollIntervalSeconds,
  });
  if (!needsConfirmation) await confirmWatch(env.DB, id);

  const appUrl = env.APP_URL.replace(/\/$/, "");

  if (needsConfirmation) {
    const confirmToken = await signToken(env.TOKEN_SECRET, id, "confirm", CONFIRM_TTL_SECONDS);
    const confirmUrl = `${appUrl}/api/watches/confirm?token=${encodeURIComponent(confirmToken)}`;
    const tpl = confirmEmail({
      appUrl: env.APP_URL,
      confirmUrl,
      carrier: cleanedCarrier,
      trackingNumber: cleanedTracking,
      label: cleanedLabel,
    });
    try {
      await sendEmail(
        { RESEND_API_KEY: env.RESEND_API_KEY, RESEND_FROM: env.RESEND_FROM, APP_URL: env.APP_URL },
        { to: cleanedEmail, ...tpl },
      );
    } catch (err) {
      // Unlike the self-addressed case below, this send isn't best-effort: the
      // link is the only path to activation, so a watch whose link never went
      // out can't ever fire. Retire it rather than leaving a dead row parked
      // against the user's cap, and report the failure.
      console.error("watch confirmation email failed:", err instanceof Error ? err.message : err);
      await cancelWatch(env.DB, id);
      return NextResponse.json({ error: "send_failed" }, { status: 502 });
    }
    return NextResponse.json({ status: "pending_confirmation", id }, { status: 201 });
  }

  // Best-effort notice so the user knows the watch is registered and has an
  // immediate unsubscribe link.
  if (mailConfigured) {
    const unsubToken = await signToken(env.TOKEN_SECRET, id, "unsubscribe");
    const unsubscribeUrl = `${appUrl}/api/watches/unsubscribe?token=${encodeURIComponent(unsubToken)}`;

    const tpl = watchCreatedEmail({
      appUrl: env.APP_URL,
      carrier: cleanedCarrier,
      trackingNumber: cleanedTracking,
      label: cleanedLabel,
      unsubscribeUrl,
    });
    try {
      await sendEmail(
        { RESEND_API_KEY: env.RESEND_API_KEY, RESEND_FROM: env.RESEND_FROM, APP_URL: env.APP_URL },
        { to: cleanedEmail, ...tpl },
      );
    } catch (err) {
      console.warn("watch confirmation email failed:", err instanceof Error ? err.message : err);
    }
  }

  return NextResponse.json({ status: "active", id }, { status: 201 });
}
