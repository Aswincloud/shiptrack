import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getEnv } from "@/lib/env";
import { getUserByEmail } from "@/lib/db";
import { verifyPasswordOrDummy } from "@aswincloud/auth/d1";
import { resendOtp } from "@aswincloud/auth/d1";
import { createSessionCookieForUser } from "@/lib/auth";
import { makeSendEmail } from "@/lib/authpkg";
import { otpEmail } from "@/lib/email";
import { LIMITS, RATE_LIMITED, clientIp, recordEvent, takeAll, underLimit } from "@/lib/rate-limit";

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

  // Only failed attempts are counted, so a user typing their password right
  // never hits the limit; guessing does, per IP and per targeted account.
  const ipKey = `login:ip:${clientIp(req)}`;
  const emailKey = `login:email:${email}`;
  if (!(await underLimit(env.DB, ipKey, LIMITS.loginPerIp)) || !(await underLimit(env.DB, emailKey, LIMITS.loginPerEmail))) {
    return NextResponse.json(RATE_LIMITED, { status: 429 });
  }

  const user = await getUserByEmail(env.DB, email);
  // Runs PBKDF2 even when there's no such user, so response time doesn't
  // reveal whether an account exists.
  const ok = await verifyPasswordOrDummy(parsed.data.password, user?.password_hash);
  if (!user || !ok) {
    await recordEvent(env.DB, ipKey);
    await recordEvent(env.DB, emailKey);
    return NextResponse.json({ error: "invalid_credentials" }, { status: 401 });
  }

  if (user.email_verified !== 1) {
    // Correct password but unverified: send a fresh OTP and route to /verify.
    // Spends the same per-address and per-IP send budget as resend-otp, so
    // someone holding the password can't send unlimited code emails.
    const sendEmailFn = makeSendEmail(env);
    if (sendEmailFn && (await takeAll(env.DB, [[`send:ip:${clientIp(req)}`, LIMITS.sendPerIp], [`send:email:${email}`, LIMITS.sendPerEmail]]))) {
      // Normal resend cooldown: without it, anyone holding the password could
      // send unlimited code emails by retrying the login.
      await resendOtp(env.DB, {
        email,
        secret: env.TOKEN_SECRET,
        sendEmail: sendEmailFn,
        renderOtp: ({ code, ttlMinutes }) => otpEmail({ code, ttlMinutes }),
      }).catch(() => {});
    }
    return NextResponse.json({ requiresVerification: true, email }, { status: 403 });
  }

  const cookie = await createSessionCookieForUser(env.TOKEN_SECRET, user);
  return NextResponse.json(
    { userId: user.id, email: user.email },
    { status: 200, headers: { "Set-Cookie": cookie } },
  );
}
