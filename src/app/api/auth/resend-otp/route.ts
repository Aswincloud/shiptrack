import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getEnv } from "@/lib/env";
import { getUserByEmail } from "@/lib/db";
import { resendOtp } from "@aswincloud/auth/d1";
import { makeSendEmail } from "@/lib/authpkg";
import { otpEmail } from "@/lib/email";
import { LIMITS, RATE_LIMITED, clientIp, recordEvent, take, underLimit } from "@/lib/rate-limit";

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

  // Same generic 200 for every outcome — no account, already verified, in the
  // cooldown, over the limit, or sent — so the response never reveals whether
  // an unverified account exists for this address.
  const allowed =
    (await take(env.DB, `send:email:${email}`, LIMITS.sendPerEmail)) &&
    (await take(env.DB, `send:ip:${clientIp(req)}`, LIMITS.sendPerIp));
  const user = allowed ? await getUserByEmail(env.DB, email) : null;
  if (user && user.email_verified !== 1) {
    await resendOtp(env.DB, {
      email,
      secret: env.TOKEN_SECRET,
      sendEmail: makeSendEmail(env)!,
      renderOtp: ({ code, ttlMinutes }) => otpEmail({ code, ttlMinutes }),
    }).catch(() => {});
  }
  return NextResponse.json({ status: "ok" }, { status: 200 });
}
