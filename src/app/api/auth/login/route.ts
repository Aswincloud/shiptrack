import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getEnv } from "@/lib/env";
import { getUserByEmail } from "@/lib/db";
import { verifyPassword } from "@aswincloud/auth";
import { resendOtp } from "@aswincloud/auth/d1";
import { createSessionCookie } from "@/lib/auth";
import { makeSendEmail } from "@/lib/authpkg";
import { otpEmail } from "@/lib/email";

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
    // Correct password but unverified: send a fresh OTP and route to /verify.
    const sendEmailFn = makeSendEmail(env);
    if (sendEmailFn) {
      // cooldownSeconds:0 — a deliberate login attempt should always (re)send.
      await resendOtp(env.DB, {
        email,
        secret: env.TOKEN_SECRET,
        sendEmail: sendEmailFn,
        cooldownSeconds: 0,
        renderOtp: ({ code, ttlMinutes }) => otpEmail({ code, ttlMinutes }),
      }).catch(() => {});
    }
    return NextResponse.json({ requiresVerification: true, email }, { status: 403 });
  }

  const cookie = await createSessionCookie(env.TOKEN_SECRET, user.id);
  return NextResponse.json(
    { userId: user.id, email: user.email },
    { status: 200, headers: { "Set-Cookie": cookie } },
  );
}
