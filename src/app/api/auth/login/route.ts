import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getEnv } from "@/lib/env";
import { getUserByEmail, upsertOtp } from "@/lib/db";
import { verifyPassword } from "@/lib/passwords";
import { createSessionCookie } from "@/lib/auth";
import { generateOtp, hashOtp, OTP_TTL_SECONDS } from "@/lib/otp";
import { sendEmail, otpEmail } from "@/lib/email";

export const dynamic = "force-dynamic";

const Body = z.object({
  email: z.string().email().max(254),
  password: z.string().min(1).max(200),
});

export async function POST(req: NextRequest) {
  const env = getEnv();
  if (!env.DB || !env.TOKEN_SECRET) {
    return NextResponse.json({ error: "not_configured" }, { status: 503 });
  }

  const json = await req.json().catch(() => null);
  const parsed = Body.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_input" }, { status: 400 });
  }
  const email = parsed.data.email.toLowerCase();

  const user = await getUserByEmail(env.DB, email);
  if (!user) {
    return NextResponse.json({ error: "invalid_credentials" }, { status: 401 });
  }

  const ok = await verifyPassword(parsed.data.password, user.password_hash);
  if (!ok) {
    return NextResponse.json({ error: "invalid_credentials" }, { status: 401 });
  }

  if (user.email_verified !== 1) {
    // Send a fresh OTP and tell the client to route to /verify.
    const code = generateOtp();
    const codeHash = await hashOtp(code, env.TOKEN_SECRET);
    const expiresAt = Math.floor(Date.now() / 1000) + OTP_TTL_SECONDS;
    await upsertOtp(env.DB, email, codeHash, expiresAt);
    const tpl = otpEmail({ code, ttlMinutes: Math.floor(OTP_TTL_SECONDS / 60) });
    if (env.RESEND_API_KEY && env.RESEND_FROM) {
      await sendEmail(
        { RESEND_API_KEY: env.RESEND_API_KEY, RESEND_FROM: env.RESEND_FROM, APP_URL: env.APP_URL },
        { to: email, ...tpl },
      );
    }
    return NextResponse.json({ requiresVerification: true, email }, { status: 403 });
  }

  const cookie = await createSessionCookie(env.TOKEN_SECRET, user.id);
  return NextResponse.json(
    { userId: user.id, email: user.email },
    { status: 200, headers: { "Set-Cookie": cookie } },
  );
}
