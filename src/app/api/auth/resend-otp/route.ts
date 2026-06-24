import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getEnv } from "@/lib/env";
import { getUserByEmail } from "@/lib/db";
import { resendOtp } from "@aswincloud/auth/d1";
import { makeSendEmail } from "@/lib/authpkg";
import { otpEmail } from "@/lib/email";

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

  // Only resend for unverified accounts. Generic 200 otherwise (anti-enumeration).
  const user = await getUserByEmail(env.DB, email);
  if (!user || user.email_verified === 1) {
    return NextResponse.json({ status: "ok" }, { status: 200 });
  }

  const r = await resendOtp(env.DB, {
    email,
    secret: env.TOKEN_SECRET,
    sendEmail: makeSendEmail(env)!,
    renderOtp: ({ code, ttlMinutes }) => otpEmail({ code, ttlMinutes }),
  });
  if (!r.ok) {
    if (r.error === "cooldown") return NextResponse.json({ error: "cooldown" }, { status: 429 });
    if (r.error === "send_failed") return NextResponse.json({ error: "send_failed" }, { status: 502 });
    // no_account — racey delete between the check and here; stay generic.
    return NextResponse.json({ status: "ok" }, { status: 200 });
  }
  return NextResponse.json({ status: "ok" }, { status: 200 });
}
