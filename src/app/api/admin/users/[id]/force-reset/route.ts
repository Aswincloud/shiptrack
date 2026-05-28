import { NextRequest, NextResponse } from "next/server";
import { getEnv } from "@/lib/env";
import { requireAdmin } from "@/lib/auth";
import { getUserById } from "@/lib/db";
import { signToken } from "@/lib/tokens";
import { sendEmail, passwordResetEmail } from "@/lib/email";

export const dynamic = "force-dynamic";

const PASSWORD_RESET_TTL_SECONDS = 60 * 60;

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const env = getEnv();
  if (!env.DB || !env.TOKEN_SECRET || !env.RESEND_API_KEY || !env.RESEND_FROM) {
    return NextResponse.json({ error: "not_configured" }, { status: 503 });
  }
  const gate = await requireAdmin(env.TOKEN_SECRET, env.DB, req);
  if (gate instanceof NextResponse) return gate;

  const { id } = await ctx.params;
  const target = await getUserById(env.DB, id);
  if (!target) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const token = await signToken(env.TOKEN_SECRET, target.id, "password_reset", PASSWORD_RESET_TTL_SECONDS);
  const resetUrl = `${env.APP_URL.replace(/\/$/, "")}/reset?token=${encodeURIComponent(token)}`;
  const tpl = passwordResetEmail({ resetUrl, ttlHours: 1 });
  await sendEmail(
    { RESEND_API_KEY: env.RESEND_API_KEY, RESEND_FROM: env.RESEND_FROM, APP_URL: env.APP_URL },
    { to: target.email, ...tpl },
  );

  return NextResponse.json({ status: "ok" });
}
