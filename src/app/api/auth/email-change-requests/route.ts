import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getEnv } from "@/lib/env";
import { readSession } from "@/lib/auth";
import { requestEmailChange } from "@aswincloud/auth/d1";
import { makeSendEmail } from "@/lib/authpkg";
import { emailChangeConfirmEmail } from "@/lib/email";

export const dynamic = "force-dynamic";

const PostBody = z.object({
  newEmail: z.string().email().max(254),
});

// POST — start a self-service email change: we email a confirm link to the NEW
// address; clicking it (→ /confirm-email → confirmEmailChange) applies it.
export async function POST(req: NextRequest) {
  const env = getEnv();
  if (!env.DB || !env.TOKEN_SECRET || !env.RESEND_API_KEY || !env.RESEND_FROM) {
    return NextResponse.json({ error: "not_configured" }, { status: 503 });
  }
  const sess = await readSession(env.TOKEN_SECRET, req);
  if (!sess) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const json = await req.json().catch(() => null);
  const parsed = PostBody.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: "invalid_input" }, { status: 400 });

  const r = await requestEmailChange(env.DB, {
    userId: sess.userId,
    newEmail: parsed.data.newEmail,
    secret: env.TOKEN_SECRET,
    sendEmail: makeSendEmail(env)!,
    appUrl: env.APP_URL,
    confirmPath: "/confirm-email",
    renderEmailChange: ({ confirmUrl, newEmail, ttlHours }) =>
      emailChangeConfirmEmail({ confirmUrl, newEmail, ttlHours }),
  });
  if (!r.ok) {
    switch (r.error) {
      case "not_found": return NextResponse.json({ error: "unauthorized" }, { status: 401 });
      case "invalid_email": return NextResponse.json({ error: "invalid_email" }, { status: 400 });
      case "same_as_current": return NextResponse.json({ error: "same_as_current" }, { status: 400 });
      case "email_taken": return NextResponse.json({ error: "email_taken" }, { status: 409 });
      case "send_failed": return NextResponse.json({ error: "send_failed" }, { status: 502 });
    }
  }
  return NextResponse.json({ status: "sent" }, { status: 202 });
}
