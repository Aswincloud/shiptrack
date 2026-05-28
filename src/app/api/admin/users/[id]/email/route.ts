import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getEnv } from "@/lib/env";
import { requireAdmin } from "@/lib/auth";
import { getUserById } from "@/lib/db";
import { sendEmail } from "@/lib/email";

export const dynamic = "force-dynamic";

const Body = z.object({
  subject: z.string().min(1).max(200),
  message: z.string().min(1).max(10_000),
});

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

  const json = await req.json().catch(() => null);
  const parsed = Body.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_input" }, { status: 400 });
  }

  const safeBody = escapeHtml(parsed.data.message).replace(/\n/g, "<br>");
  const html = `
    <div style="font-family:system-ui,sans-serif;max-width:560px;margin:auto;padding:24px;color:#111;line-height:1.5">
      ${safeBody}
      <p style="margin-top:32px;color:#888;font-size:12px">— Sent by ShipTrack admin</p>
    </div>
  `;

  await sendEmail(
    { RESEND_API_KEY: env.RESEND_API_KEY, RESEND_FROM: env.RESEND_FROM, APP_URL: env.APP_URL },
    { to: target.email, subject: parsed.data.subject, html, text: parsed.data.message },
  );

  return NextResponse.json({ status: "ok" });
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
