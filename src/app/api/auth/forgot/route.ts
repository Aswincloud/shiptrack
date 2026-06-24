import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getEnv } from "@/lib/env";
import { requestPasswordReset } from "@aswincloud/auth/d1";
import { makeSendEmail } from "@/lib/authpkg";
import { passwordResetEmail } from "@/lib/email";

export const dynamic = "force-dynamic";

const Body = z.object({ email: z.string().email().max(254) });

export async function POST(req: NextRequest) {
  const env = getEnv();
  // Always return 200 to avoid email enumeration — even when unconfigured.
  if (!env.DB || !env.TOKEN_SECRET) {
    return NextResponse.json({ status: "ok" }, { status: 200 });
  }

  const json = await req.json().catch(() => null);
  const parsed = Body.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ status: "ok" }, { status: 200 });
  }

  const sendEmailFn = makeSendEmail(env);
  if (sendEmailFn) {
    // Flow always resolves { ok: true } and swallows send errors (anti-enumeration).
    await requestPasswordReset(env.DB, {
      email: parsed.data.email.toLowerCase(),
      secret: env.TOKEN_SECRET,
      sendEmail: sendEmailFn,
      appUrl: env.APP_URL,
      resetPath: "/reset",
      renderReset: ({ resetUrl }) => passwordResetEmail({ resetUrl, ttlHours: 1 }),
    });
  }

  return NextResponse.json({ status: "ok" }, { status: 200 });
}
