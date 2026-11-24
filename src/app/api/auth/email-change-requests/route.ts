import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getEnv } from "@/lib/env";
import { readSession } from "@/lib/auth";
import { requestEmailChange, hasRealPassword } from "@aswincloud/auth/d1";
import { verifyPassword } from "@aswincloud/auth";
import { getUserById } from "@/lib/db";
import { makeSendEmail } from "@/lib/authpkg";
import { emailChangeConfirmEmail } from "@/lib/email";
import { LIMITS, RATE_LIMITED, clientIp, recordEvent, underLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

const PostBody = z.object({
  newEmail: z.string().email().max(254),
  // Required when the account has a password: a session alone mustn't be
  // enough to move the login email (and with it, password reset) elsewhere.
  currentPassword: z.string().min(1).max(200).optional(),
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

  const user = await getUserById(env.DB, sess.userId);
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (hasRealPassword(user)) {
    if (!parsed.data.currentPassword) {
      return NextResponse.json({ error: "current_password_required" }, { status: 400 });
    }
    // Same failed-guess limits as login: a stolen session mustn't become a way
    // to brute-force the password.
    const userKey = `login:email:${user.email.toLowerCase()}`;
    const ipKey = `login:ip:${clientIp(req)}`;
    if (!(await underLimit(env.DB, userKey, LIMITS.loginPerEmail)) || !(await underLimit(env.DB, ipKey, LIMITS.loginPerIp))) {
      return NextResponse.json(RATE_LIMITED, { status: 429 });
    }
    if (!(await verifyPassword(parsed.data.currentPassword, user.password_hash))) {
      await recordEvent(env.DB, userKey);
      await recordEvent(env.DB, ipKey);
      return NextResponse.json({ error: "invalid_credentials" }, { status: 401 });
    }
  }

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
