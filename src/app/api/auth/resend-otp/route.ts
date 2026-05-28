import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getEnv } from "@/lib/env";
import { getUserByEmail, getOtp, upsertOtp } from "@/lib/db";
import { generateOtp, hashOtp, OTP_TTL_SECONDS, OTP_RESEND_COOLDOWN_SECONDS } from "@/lib/otp";
import { sendEmail, otpEmail } from "@/lib/email";

export const dynamic = "force-dynamic";

const Body = z.object({ email: z.string().email().max(254) });

export async function POST(req: NextRequest) {
  const env = getEnv();
  if (!env.DB || !env.TOKEN_SECRET || !env.RESEND_API_KEY || !env.RESEND_FROM) {
    return NextResponse.json({ error: "not_configured" }, { status: 503 });
  }

  const json = await req.json().catch(() => null);
  const parsed = Body.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_input" }, { status: 400 });
  }
  const email = parsed.data.email.toLowerCase();

  const user = await getUserByEmail(env.DB, email);
  // Only resend for unverified accounts. Generic 200 otherwise to prevent enumeration.
  if (!user || user.email_verified === 1) {
    return NextResponse.json({ status: "ok" }, { status: 200 });
  }

  const existing = await getOtp(env.DB, email);
  const now = Math.floor(Date.now() / 1000);
  if (existing && existing.created_at + OTP_RESEND_COOLDOWN_SECONDS > now) {
    return NextResponse.json({ error: "cooldown" }, { status: 429 });
  }

  const code = generateOtp();
  const codeHash = await hashOtp(code, env.TOKEN_SECRET);
  await upsertOtp(env.DB, email, codeHash, now + OTP_TTL_SECONDS);

  const tpl = otpEmail({ code, ttlMinutes: Math.floor(OTP_TTL_SECONDS / 60) });
  await sendEmail(
    { RESEND_API_KEY: env.RESEND_API_KEY, RESEND_FROM: env.RESEND_FROM, APP_URL: env.APP_URL },
    { to: email, ...tpl },
  );

  return NextResponse.json({ status: "ok" }, { status: 200 });
}
