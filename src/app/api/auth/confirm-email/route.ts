import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getEnv } from "@/lib/env";
import { confirmEmailChange } from "@aswincloud/auth/d1";
import { verifyToken } from "@aswincloud/auth";
import { getUserById } from "@/lib/db";
import { sendEmail, emailChangedNoticeEmail } from "@/lib/email";

export const dynamic = "force-dynamic";

const Body = z.object({ token: z.string().min(10) });

// POST — finish a self-service email change. The token (sent to the NEW address)
// binds both the userId and the target email, so it can't be retargeted.
export async function POST(req: NextRequest) {
  const env = getEnv();
  if (!env.DB || !env.TOKEN_SECRET) {
    return NextResponse.json({ error: "not_configured" }, { status: 503 });
  }

  const json = await req.json().catch(() => null);
  const parsed = Body.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: "invalid_input" }, { status: 400 });

  // Note the current (old) address before it changes, so we can tell its owner.
  const subject = await verifyToken(env.TOKEN_SECRET, parsed.data.token, "email_change");
  const before = subject ? await getUserById(env.DB, subject.split(":")[0] ?? "") : null;

  const r = await confirmEmailChange(env.DB, { token: parsed.data.token, secret: env.TOKEN_SECRET });
  if (!r.ok) {
    const status = r.error === "email_taken" ? 409 : 400;
    return NextResponse.json({ error: r.error }, { status });
  }

  if (before && before.email !== r.email && env.RESEND_API_KEY && env.RESEND_FROM) {
    await sendEmail(
      { RESEND_API_KEY: env.RESEND_API_KEY, RESEND_FROM: env.RESEND_FROM, APP_URL: env.APP_URL },
      { to: before.email, ...emailChangedNoticeEmail({ newEmail: r.email, appUrl: env.APP_URL }) },
    ).catch((err) => console.warn("email-change notice failed:", err instanceof Error ? err.message : err));
  }
  return NextResponse.json({ status: "ok", email: r.email });
}
