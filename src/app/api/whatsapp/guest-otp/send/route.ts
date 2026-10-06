import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { generateOtp, hashOtp } from "@aswincloud/auth/d1";
import { getEnv } from "@/lib/env";
import { getCarrier } from "@/carriers/registry";
import {
  countAllPhoneOtpSendsSince,
  countGuestWatchesForPhoneSince,
  countPhoneOtpSendsForPhoneSince,
  countPhoneOtpSendsForUserSince,
  findActiveGuestWatchForPhone,
  findGuestPhoneOtp,
  insertGuestPhoneOtp,
  recordPhoneOtpSend,
  MAX_GUEST_OTP_SENDS_PER_HOUR,
  MAX_GUEST_OTP_SENDS_PER_IP_PER_DAY,
  MAX_GUEST_WATCHES_PER_PHONE_PER_DAY,
  MAX_PHONE_OTP_SENDS_PER_PHONE_PER_DAY,
  PHONE_OTP_RESEND_COOLDOWN_SECONDS,
  PHONE_OTP_TTL_SECONDS,
} from "@/lib/db";
import { formatPhoneForDisplay, normalizePhone, sendOtp, whatsappOtpConfigured, WhatsAppError } from "@/lib/whatsapp";

export const dynamic = "force-dynamic";

// Guest WhatsApp alerts, step 1: a signed-out visitor on a "not found yet"
// page types their number; we send a one-time code via the shiptrack_verify
// template. Every send is a billed message triggered anonymously, so it is
// limited per number, per visitor IP, and site-wide per hour, with a resend
// cooldown — and the most a wrong number can ever receive is a code.

const Body = z.object({
  phone: z.string().max(32),
  carrier: z.string().min(1).max(32),
  trackingNumber: z.string().min(4).max(40),
  label: z.string().max(80).optional(),
});

export async function POST(req: NextRequest) {
  const env = getEnv();
  if (!env.DB || !env.TOKEN_SECRET || !whatsappOtpConfigured(env)) {
    return NextResponse.json({ error: "not_configured" }, { status: 503 });
  }
  const json = await req.json().catch(() => null);
  const parsed = Body.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: "invalid_input" }, { status: 400 });
  const carrier = parsed.data.carrier.toLowerCase();
  if (!getCarrier(carrier)) return NextResponse.json({ error: "carrier_not_supported" }, { status: 400 });
  const trackingNumber = parsed.data.trackingNumber.trim();
  const phone = normalizePhone(parsed.data.phone);
  if (!phone) return NextResponse.json({ error: "invalid_phone" }, { status: 400 });

  const now = Math.floor(Date.now() / 1000);
  if (await findActiveGuestWatchForPhone(env.DB, phone, carrier, trackingNumber)) {
    return NextResponse.json({ error: "already_watching", phoneDisplay: formatPhoneForDisplay(phone) }, { status: 409 });
  }
  if ((await countGuestWatchesForPhoneSince(env.DB, phone, now - 86400)) >= MAX_GUEST_WATCHES_PER_PHONE_PER_DAY) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }
  const existing = await findGuestPhoneOtp(env.DB, phone, carrier, trackingNumber);
  if (existing && now - existing.created_at < PHONE_OTP_RESEND_COOLDOWN_SECONDS) {
    return NextResponse.json(
      { error: "cooldown", retryAfter: PHONE_OTP_RESEND_COOLDOWN_SECONDS - (now - existing.created_at) },
      { status: 429 },
    );
  }
  const ip = req.headers.get("cf-connecting-ip") || req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const ipKey = `guest:${ip}`;
  const dayAgo = now - 86400;
  if (
    (await countPhoneOtpSendsForUserSince(env.DB, ipKey, dayAgo)) >= MAX_GUEST_OTP_SENDS_PER_IP_PER_DAY ||
    (await countPhoneOtpSendsForPhoneSince(env.DB, phone, dayAgo)) >= MAX_PHONE_OTP_SENDS_PER_PHONE_PER_DAY ||
    (await countAllPhoneOtpSendsSince(env.DB, now - 3600, "guest:")) >= MAX_GUEST_OTP_SENDS_PER_HOUR
  ) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }

  const id = crypto.randomUUID();
  const code = generateOtp();
  const expiresAt = now + PHONE_OTP_TTL_SECONDS;
  await insertGuestPhoneOtp(env.DB, {
    id,
    phone,
    carrier,
    tracking_number: trackingNumber,
    label: parsed.data.label?.trim() || null,
    code_hash: await hashOtp(code, env.TOKEN_SECRET),
    expires_at: expiresAt,
  });
  await recordPhoneOtpSend(env.DB, ipKey, phone);
  try {
    await sendOtp(env, phone, code);
  } catch (err) {
    if (err instanceof WhatsAppError) {
      if (err.code === "invalid_recipient") return NextResponse.json({ error: "not_on_whatsapp" }, { status: 400 });
      if (err.code === "rate_limited") return NextResponse.json({ error: "rate_limited" }, { status: 429 });
      if (err.code === "template_unavailable" || err.code === "not_configured") {
        console.error("guest otp send", { error: err.message });
        return NextResponse.json({ error: "not_configured" }, { status: 503 });
      }
    }
    console.error("guest otp send failed", { error: err instanceof Error ? err.message : String(err) });
    return NextResponse.json({ error: "send_failed" }, { status: 502 });
  }
  return NextResponse.json({ status: "sent", requestId: id, phoneDisplay: formatPhoneForDisplay(phone), expiresAt });
}
