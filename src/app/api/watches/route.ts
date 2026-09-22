import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getEnv } from "@/lib/env";
import { generateOtp } from "@aswincloud/auth/d1";
import {
  cancelWatch,
  createWatch,
  confirmWatch,
  linkCodeInUse,
  upsertWatchPhoneVerification,
  PHONE_LINK_TTL_SECONDS,
  countGuestWatchesForEmailSince,
  countGuestWatchesSince,
  countOpenWatchesForUser,
  findOpenGuestWatch,
  getUserById,
  CONFIRM_TTL_SECONDS,
  DEFAULT_POLL_INTERVAL_SECONDS,
  MAX_GUEST_WATCHES_PER_EMAIL_PER_DAY,
  MAX_GUEST_WATCHES_PER_HOUR,
  MAX_OPEN_WATCHES_PER_USER,
  MIN_POLL_INTERVAL_SECONDS,
  MAX_POLL_INTERVAL_SECONDS,
} from "@/lib/db";
import { getCarrier } from "@/carriers/registry";
import { readSession } from "@/lib/auth";
import { signToken } from "@/lib/tokens";
import { sendEmail, watchCreatedEmail, confirmEmail } from "@/lib/email";
import { buildWaLink, formatPhoneForDisplay, linkMessageText, whatsappLinkingConfigured } from "@/lib/whatsapp";

export const dynamic = "force-dynamic";

const Body = z.object({
  // Required for the email channel; absent for a guest WhatsApp watch, whose
  // recipient is learned from the message they send us.
  email: z.string().email().max(254).optional(),
  // "whatsapp" (guests only): no address, no confirmation link — the visitor
  // sends us "VERIFY <code>" from WhatsApp and that message both proves the
  // number and confirms the watch. Default "email".
  channel: z.enum(["email", "whatsapp"]).optional(),
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

  // Auth: prefer session cookie, then the ADMIN_TOKEN bearer (legacy / owner
  // curl flow). A request carrying neither is a signed-out visitor asking us to
  // watch a shipment from a track page — allowed, but only ever as a
  // double-opt-in request: `guest` forces confirmation and rate limits below.
  //
  // `selfEmail` is the requester's own verified address, and stays null for the
  // ADMIN_TOKEN path — that token is the operator's own credential, so their
  // curl flow keeps activating watches outright.
  const session = await readSession(env.TOKEN_SECRET, req);
  let userId: string | null = null;
  let selfEmail: string | null = null;
  let guest = false;
  if (session) {
    const user = await getUserById(env.DB, session.userId);
    if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    userId = user.id;
    selfEmail = user.email.toLowerCase();
  } else {
    const auth = req.headers.get("authorization") ?? "";
    const provided = auth.startsWith("Bearer ") ? auth.slice(7) : "";
    if (provided) {
      // A bearer token was offered: it either matches or the request is
      // rejected. Falling through to the guest path would turn a typo'd
      // operator token into a silently downgraded request.
      if (!env.ADMIN_TOKEN || provided !== env.ADMIN_TOKEN) {
        return NextResponse.json({ error: "unauthorized" }, { status: 401 });
      }
    } else {
      guest = true;
    }
  }

  const json = await req.json().catch(() => null);
  const parsed = Body.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_input", details: parsed.error.flatten() }, { status: 400 });
  }
  const { email, carrier, trackingNumber, label } = parsed.data;
  const channel = parsed.data.channel ?? "email";
  if (channel === "email" && !email) {
    return NextResponse.json({ error: "invalid_input", details: { email: "required" } }, { status: 400 });
  }
  if (channel === "whatsapp" && !guest) {
    // Signed-in users' watches already reach the number linked in Settings.
    return NextResponse.json(
      { error: "signed_in_use_settings", message: "WhatsApp alerts for your account use the number linked in Settings." },
      { status: 400 },
    );
  }
  if (channel === "whatsapp" && !whatsappLinkingConfigured(env)) {
    return NextResponse.json({ error: "not_configured" }, { status: 503 });
  }

  if (!getCarrier(carrier)) {
    return NextResponse.json({ error: "carrier_not_supported" }, { status: 400 });
  }

  const cleanedEmail = (email ?? "").toLowerCase();
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

  if (guest) {
    const now = Math.floor(Date.now() / 1000);
    if (channel === "email") {
      // Repeat request for the same shipment while the link we already sent is
      // still good: say so rather than mailing the address again. Once that link
      // has expired the old row is ignored and a fresh one goes out.
      const existing = await findOpenGuestWatch(env.DB, cleanedEmail, cleanedCarrier, cleanedTracking, now);
      if (existing) {
        return NextResponse.json(
          {
            status: existing.status === "active" ? "active" : "pending_confirmation",
            id: existing.id,
            duplicate: true,
          },
          { status: 200 },
        );
      }

      const perEmail = await countGuestWatchesForEmailSince(env.DB, cleanedEmail, now - 24 * 60 * 60);
      if (perEmail >= MAX_GUEST_WATCHES_PER_EMAIL_PER_DAY) {
        return NextResponse.json(
          {
            error: "rate_limited",
            message: `That address has already requested ${MAX_GUEST_WATCHES_PER_EMAIL_PER_DAY} shipment alerts today. Create an account to watch more.`,
          },
          { status: 429 },
        );
      }
    }
    // (WhatsApp guests: the per-number cap and duplicate check run in the
    // webhook, once the sender's number is known.)
    const siteWide = await countGuestWatchesSince(env.DB, now - 60 * 60);
    if (siteWide >= MAX_GUEST_WATCHES_PER_HOUR) {
      return NextResponse.json(
        {
          error: "rate_limited",
          message: "We're handling a lot of alert requests right now. Try again in a little while.",
        },
        { status: 429 },
      );
    }
  }

  if (channel === "whatsapp") {
    // Create the watch pending with no recipient yet; the webhook fills in the
    // number and activates it when "VERIFY <code>" arrives from WhatsApp.
    const now = Math.floor(Date.now() / 1000);
    const id = crypto.randomUUID();
    await createWatch(env.DB, {
      id,
      userId: null,
      email: "", // NOT NULL column; '' = no email recipient
      carrier: cleanedCarrier,
      trackingNumber: cleanedTracking,
      label: cleanedLabel,
      pollIntervalSeconds: DEFAULT_POLL_INTERVAL_SECONDS,
    });
    // Six digits from a CSPRNG, unique across user-link and watch-link codes so
    // an inbound code can only ever mean one thing.
    let code = generateOtp();
    for (let i = 0; i < 5 && (await linkCodeInUse(env.DB, code, now)); i++) code = generateOtp();
    const expiresAt = now + PHONE_LINK_TTL_SECONDS;
    await upsertWatchPhoneVerification(env.DB, id, code, expiresAt);
    return NextResponse.json(
      {
        status: "pending_whatsapp",
        id,
        code,
        message: linkMessageText(code),
        waLink: buildWaLink(env.WHATSAPP_BUSINESS_NUMBER!, code),
        businessNumberDisplay: formatPhoneForDisplay(env.WHATSAPP_BUSINESS_NUMBER!),
        expiresAt,
      },
      { status: 201 },
    );
  }

  // A watch may only mail an address that has agreed to hear from us. Your own
  // account address is self-evidently consented; anyone else's has to click a
  // confirmation link before the poller will alert it — otherwise an account
  // could point watches at strangers and use ShipTrack to mail them. A
  // signed-out visitor has proved nothing, so their request always confirms.
  const needsConfirmation = guest || (selfEmail !== null && cleanedEmail !== selfEmail);

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
    // Guests don't get to pick a cadence: an unowned watch nobody can see on a
    // dashboard shouldn't be able to claim the poller's tightest interval.
    pollIntervalSeconds: guest ? DEFAULT_POLL_INTERVAL_SECONDS : parsed.data.pollIntervalSeconds,
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
