import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getEnv } from "@/lib/env";
import { createUser, getUserByEmail, upsertOtp } from "@/lib/db";
import { hashPassword } from "@/lib/passwords";
import { generateOtp, hashOtp, OTP_TTL_SECONDS } from "@/lib/otp";
import { sendEmail, otpEmail } from "@/lib/email";

export const dynamic = "force-dynamic";

const Body = z.object({
  email: z.string().email().max(254),
  password: z.string().min(8).max(200),
});

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
  const password = parsed.data.password;

  const existing = await getUserByEmail(env.DB, email);
  if (existing && existing.email_verified === 1) {
    // Don't reveal that a verified account exists.
    return NextResponse.json({ status: "pending_verification" }, { status: 202 });
  }

  if (!existing) {
    const id = crypto.randomUUID();
    const passwordHash = await hashPassword(password);
    await createUser(env.DB, { id, email, passwordHash });
  } else {
    // Existing unverified account: refresh its password so the user can complete signup
    // from a different device without remembering their first attempt.
    const passwordHash = await hashPassword(password);
    await env.DB.prepare(`UPDATE users SET password_hash = ? WHERE id = ?`).bind(passwordHash, existing.id).run();
  }

  const code = generateOtp();
  const codeHash = await hashOtp(code, env.TOKEN_SECRET);
  const expiresAt = Math.floor(Date.now() / 1000) + OTP_TTL_SECONDS;
  await upsertOtp(env.DB, email, codeHash, expiresAt);

  const tpl = otpEmail({ code, ttlMinutes: Math.floor(OTP_TTL_SECONDS / 60) });
  await sendEmail(
    { RESEND_API_KEY: env.RESEND_API_KEY, RESEND_FROM: env.RESEND_FROM, APP_URL: env.APP_URL },
    { to: email, ...tpl },
  );

  return NextResponse.json({ status: "pending_verification" }, { status: 202 });
}
