import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { generateOtp, hashOtp } from "@aswincloud/auth/d1";
import { getEnv } from "@/lib/env";
import { readSession } from "@/lib/auth";
import {
  countPhoneOtpSendsForPhoneSince,
  countPhoneOtpSendsForUserSince,
  getPhoneOtp,
  getUserById,
  recordPhoneOtpSend,
  upsertPhoneOtp,
  MAX_PHONE_OTP_SENDS_PER_PHONE_PER_DAY,
  MAX_PHONE_OTP_SENDS_PER_USER_PER_DAY,
  PHONE_OTP_RESEND_COOLDOWN_SECONDS,
  PHONE_OTP_TTL_SECONDS,
} from "@/lib/db";
import { formatPhoneForDisplay, normalizePhone, sendOtp, whatsappOtpConfigured, WhatsAppError } from "@/lib/whatsapp";

export const dynamic = "force-dynamic";

// "Enter your number instead": the desktop-friendly way to link a WhatsApp
// number, for someone who can't easily send us a message from where they are.
// We send a one-time code to the typed number (the shiptrack_verify
// authentication template) and they type it back to ../verify.
//
// Unlike the message-first path this sends a billed message to a number nobody
// has proved they hold yet, so it is rate-limited per account and per number,
// and a wrong number can only ever receive a code, never an alert. Stays
// signed-in-only for the same reason: an anonymous code sender on the support
// number is the worst abuse surface we could offer.

const Body = z.object({
  // Omit to resend to the number of the outstanding code (page reload mid-flow).
  phone: z.string().max(32).optional(),
});

export async function POST(req: NextRequest) {
  const env = getEnv();
  if (!env.DB || !env.TOKEN_SECRET) return NextResponse.json({ error: "not_configured" }, { status: 503 });
  if (!whatsappOtpConfigured(env)) return NextResponse.json({ error: "not_configured" }, { status: 503 });
  const sess = await readSession(env.TOKEN_SECRET, req);
  if (!sess) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const user = await getUserById(env.DB, sess.userId);
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const json = await req.json().catch(() => ({}));
  const parsed = Body.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: "invalid_input" }, { status: 400 });

  const now = Math.floor(Date.now() / 1000);
  const existing = await getPhoneOtp(env.DB, user.id);
  const raw = parsed.data.phone?.trim();
  const phone = raw ? normalizePhone(raw) : (existing?.phone ?? null);
  if (!phone) return NextResponse.json({ error: "invalid_phone" }, { status: 400 });

  if (existing && now - existing.created_at < PHONE_OTP_RESEND_COOLDOWN_SECONDS) {
    return NextResponse.json(
      { error: "cooldown", retryAfter: PHONE_OTP_RESEND_COOLDOWN_SECONDS - (now - existing.created_at) },
      { status: 429 },
    );
  }
  const dayAgo = now - 24 * 60 * 60;
  if ((await countPhoneOtpSendsForUserSince(env.DB, user.id, dayAgo)) >= MAX_PHONE_OTP_SENDS_PER_USER_PER_DAY) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }
  if ((await countPhoneOtpSendsForPhoneSince(env.DB, phone, dayAgo)) >= MAX_PHONE_OTP_SENDS_PER_PHONE_PER_DAY) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }

  const code = generateOtp();
  const expiresAt = now + PHONE_OTP_TTL_SECONDS;
  // Store (and count) before sending: a send that succeeds but whose response we
  // lose must still verify, and a failed attempt still costs quota.
  await upsertPhoneOtp(env.DB, user.id, phone, await hashOtp(code, env.TOKEN_SECRET), expiresAt);
  await recordPhoneOtpSend(env.DB, user.id, phone);
  try {
    await sendOtp(env, phone, code);
  } catch (err) {
    if (err instanceof WhatsAppError) {
      if (err.code === "invalid_recipient") return NextResponse.json({ error: "not_on_whatsapp" }, { status: 400 });
      if (err.code === "rate_limited") return NextResponse.json({ error: "rate_limited" }, { status: 429 });
      if (err.code === "template_unavailable" || err.code === "not_configured") {
        console.error("whatsapp otp send:", err.message);
        return NextResponse.json({ error: err.code }, { status: 503 });
      }
    }
    console.error("whatsapp otp send failed:", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "send_failed" }, { status: 502 });
  }

  return NextResponse.json({ status: "sent", phoneDisplay: formatPhoneForDisplay(phone), expiresAt });
}
