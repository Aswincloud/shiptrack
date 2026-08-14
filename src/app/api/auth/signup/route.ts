import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getEnv } from "@/lib/env";
import { getUserByEmail, listAdminEmails } from "@/lib/db";
import { signup } from "@aswincloud/auth/d1";
import { makeSendEmail, emailAllowedForSite } from "@/lib/authpkg";
import { sendEmail, otpEmail, newSignupAdminEmail } from "@/lib/email";

export const dynamic = "force-dynamic";

const Body = z.object({
  email: z.string().email().max(254),
  password: z.string().min(8).max(200),
});

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

  // Access policy: does this email satisfy the site's signup gate? Default is
  // "public" (open) unless ACCESS_MODE restricts it. Checked before any DB read
  // so a disallowed email reveals nothing about existing accounts.
  if (!emailAllowedForSite(env, email)) {
    return NextResponse.json({ error: "not_allowed" }, { status: 403 });
  }

  // Anti-enumeration: a verified account already exists → generic pending, no
  // password reset / email. (The flow would re-send a code to a verified user.)
  const existing = await getUserByEmail(env.DB, email);
  if (existing && existing.email_verified === 1) {
    return NextResponse.json({ status: "pending_verification" }, { status: 202 });
  }

  const sendEmailFn = makeSendEmail(env)!; // RESEND_* checked above
  const r = await signup(env.DB, {
    email,
    password: parsed.data.password,
    secret: env.TOKEN_SECRET,
    sendEmail: sendEmailFn,
    newUserId: () => crypto.randomUUID(),
    renderOtp: ({ code, ttlMinutes }) => otpEmail({ code, ttlMinutes }), // ShipTrack-branded
  });
  if (!r.ok) {
    const status = r.error === "send_failed" ? 502 : 400;
    const error = r.error === "send_failed" ? "send_failed" : "invalid_input";
    return NextResponse.json({ error }, { status });
  }

  // Best-effort admin notification, only for genuinely new accounts (not a
  // re-attempt on an existing unverified row).
  if (!existing) {
    try {
      const admins = await listAdminEmails(env.DB);
      const adminTpl = newSignupAdminEmail({ newUserEmail: email, appUrl: env.APP_URL });
      await Promise.all(
        admins.map((to) =>
          sendEmail(
            { RESEND_API_KEY: env.RESEND_API_KEY, RESEND_FROM: env.RESEND_FROM, APP_URL: env.APP_URL },
            { to, ...adminTpl },
          ).catch((err) => console.warn(`admin notify failed for ${to}:`, err)),
        ),
      );
    } catch (err) {
      console.warn("admin signup notify failed:", err instanceof Error ? err.message : err);
    }
  }

  return NextResponse.json({ status: "pending_verification" }, { status: 202 });
}
