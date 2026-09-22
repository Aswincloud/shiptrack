import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { hashOtp, otpHashEquals } from "@aswincloud/auth/d1";
import { getEnv } from "@/lib/env";
import { readSession } from "@/lib/auth";
import {
  deletePhoneOtp,
  getPhoneOtp,
  getUserById,
  incrementPhoneOtpAttempts,
  linkUserPhone,
  PHONE_OTP_MAX_ATTEMPTS,
} from "@/lib/db";
import { whatsappStatusFor } from "@/lib/whatsapp-status";

export const dynamic = "force-dynamic";

const Body = z.object({ code: z.string().regex(/^\d{6}$/) });

// Second half of "enter your number": check the typed code against the hash we
// stored, then bind the number it was sent to. Same end state as the
// message-first path (linkUserPhone), so STOP/START and alerts work identically.
export async function POST(req: NextRequest) {
  const env = getEnv();
  if (!env.DB || !env.TOKEN_SECRET) return NextResponse.json({ error: "not_configured" }, { status: 503 });
  const sess = await readSession(env.TOKEN_SECRET, req);
  if (!sess) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const user = await getUserById(env.DB, sess.userId);
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const json = await req.json().catch(() => null);
  const parsed = Body.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: "invalid_code" }, { status: 400 });

  const otp = await getPhoneOtp(env.DB, user.id);
  if (!otp) return NextResponse.json({ error: "no_code" }, { status: 400 });
  const now = Math.floor(Date.now() / 1000);
  if (otp.expires_at <= now) {
    await deletePhoneOtp(env.DB, user.id);
    return NextResponse.json({ error: "expired" }, { status: 400 });
  }
  if (otp.attempts >= PHONE_OTP_MAX_ATTEMPTS) {
    return NextResponse.json({ error: "too_many_attempts" }, { status: 429 });
  }
  const candidate = await hashOtp(parsed.data.code, env.TOKEN_SECRET);
  if (!otpHashEquals(candidate, otp.code_hash)) {
    await incrementPhoneOtpAttempts(env.DB, user.id);
    const left = PHONE_OTP_MAX_ATTEMPTS - (otp.attempts + 1);
    return NextResponse.json({ error: left > 0 ? "invalid_code" : "too_many_attempts", attemptsLeft: left }, { status: left > 0 ? 400 : 429 });
  }

  await linkUserPhone(env.DB, user.id, otp.phone); // also clears both code tables
  console.log(`whatsapp linked ${otp.phone} to user ${user.id} via one-time code`);
  const fresh = (await getUserById(env.DB, user.id)) ?? user;
  return NextResponse.json(whatsappStatusFor(env, fresh, null, null));
}
