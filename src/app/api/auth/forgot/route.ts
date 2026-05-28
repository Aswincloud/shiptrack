import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getEnv } from "@/lib/env";
import { getUserByEmail } from "@/lib/db";
import { signToken } from "@/lib/tokens";
import { sendEmail, passwordResetEmail } from "@/lib/email";

export const dynamic = "force-dynamic";

const PASSWORD_RESET_TTL_SECONDS = 60 * 60; // 1 hour
const Body = z.object({ email: z.string().email().max(254) });

export async function POST(req: NextRequest) {
  const env = getEnv();
  if (!env.DB || !env.TOKEN_SECRET) {
    return NextResponse.json({ status: "ok" }, { status: 200 });
  }

  const json = await req.json().catch(() => null);
  const parsed = Body.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ status: "ok" }, { status: 200 });
  }
  const email = parsed.data.email.toLowerCase();

  const user = await getUserByEmail(env.DB, email);
  // Always return 200 to avoid email enumeration.
  if (!user || !env.RESEND_API_KEY || !env.RESEND_FROM) {
    return NextResponse.json({ status: "ok" }, { status: 200 });
  }

  const token = await signToken(env.TOKEN_SECRET, user.id, "password_reset", PASSWORD_RESET_TTL_SECONDS);
  const resetUrl = `${env.APP_URL.replace(/\/$/, "")}/reset?token=${encodeURIComponent(token)}`;
  const tpl = passwordResetEmail({ resetUrl, ttlHours: 1 });
  try {
    await sendEmail(
      { RESEND_API_KEY: env.RESEND_API_KEY, RESEND_FROM: env.RESEND_FROM, APP_URL: env.APP_URL },
      { to: user.email, ...tpl },
    );
  } catch {
    // Swallow Resend errors so we don't reveal account existence by timing.
  }

  return NextResponse.json({ status: "ok" }, { status: 200 });
}
