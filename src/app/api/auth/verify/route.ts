import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getEnv } from "@/lib/env";
import { getUserByEmail, getOtp, deleteOtp, incrementOtpAttempts, markEmailVerified } from "@/lib/db";
import { hashOtp, constantTimeEqualString, OTP_MAX_ATTEMPTS } from "@/lib/otp";
import { createSessionCookie } from "@/lib/auth";

export const dynamic = "force-dynamic";

const Body = z.object({
  email: z.string().email().max(254),
  code: z.string().regex(/^\d{6}$/),
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
  const code = parsed.data.code;

  const otp = await getOtp(env.DB, email);
  if (!otp) return NextResponse.json({ error: "invalid_code" }, { status: 400 });

  if (otp.attempts >= OTP_MAX_ATTEMPTS) {
    await deleteOtp(env.DB, email);
    return NextResponse.json({ error: "too_many_attempts" }, { status: 429 });
  }

  if (otp.expires_at < Math.floor(Date.now() / 1000)) {
    await deleteOtp(env.DB, email);
    return NextResponse.json({ error: "expired" }, { status: 400 });
  }

  const candidate = await hashOtp(code, env.TOKEN_SECRET);
  if (!constantTimeEqualString(candidate, otp.code_hash)) {
    await incrementOtpAttempts(env.DB, email);
    return NextResponse.json({ error: "invalid_code" }, { status: 400 });
  }

  const user = await getUserByEmail(env.DB, email);
  if (!user) return NextResponse.json({ error: "no_account" }, { status: 400 });

  await markEmailVerified(env.DB, user.id);
  await deleteOtp(env.DB, email);

  const cookie = await createSessionCookie(env.TOKEN_SECRET, user.id);
  return NextResponse.json(
    { userId: user.id, email: user.email },
    { status: 200, headers: { "Set-Cookie": cookie } },
  );
}
