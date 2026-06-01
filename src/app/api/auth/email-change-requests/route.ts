import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getEnv } from "@/lib/env";
import { readSession } from "@/lib/auth";
import {
  getUserById,
  getUserByEmail,
  getPendingEmailChangeRequestForUser,
  createEmailChangeRequest,
  listAdminEmails,
} from "@/lib/db";
import { sendEmail, emailChangeRequestAdminEmail } from "@/lib/email";

export const dynamic = "force-dynamic";

const PostBody = z.object({
  requestedEmail: z.string().email().max(254),
});

// GET — current pending request (if any), for the settings page to show state.
export async function GET(req: NextRequest) {
  const env = getEnv();
  if (!env.DB || !env.TOKEN_SECRET) return NextResponse.json({ error: "not_configured" }, { status: 503 });
  const sess = await readSession(env.TOKEN_SECRET, req);
  if (!sess) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const pending = await getPendingEmailChangeRequestForUser(env.DB, sess.userId);
  return NextResponse.json({ pending });
}

// POST — create a new request. One pending request per user (enforced by a
// partial unique index too, but we check first for a nicer error message).
export async function POST(req: NextRequest) {
  const env = getEnv();
  if (!env.DB || !env.TOKEN_SECRET) return NextResponse.json({ error: "not_configured" }, { status: 503 });
  const sess = await readSession(env.TOKEN_SECRET, req);
  if (!sess) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const json = await req.json().catch(() => null);
  const parsed = PostBody.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: "invalid_input" }, { status: 400 });
  const requested = parsed.data.requestedEmail.toLowerCase().trim();

  const user = await getUserById(env.DB, sess.userId);
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  if (requested === user.email.toLowerCase()) {
    return NextResponse.json({ error: "same_as_current" }, { status: 400 });
  }

  // Block requests that would collide with an existing account.
  const collision = await getUserByEmail(env.DB, requested);
  if (collision) return NextResponse.json({ error: "email_taken" }, { status: 409 });

  const existing = await getPendingEmailChangeRequestForUser(env.DB, sess.userId);
  if (existing) return NextResponse.json({ error: "already_pending", pending: existing }, { status: 409 });

  await createEmailChangeRequest(env.DB, {
    userId: user.id,
    currentEmail: user.email,
    requestedEmail: requested,
  });

  // Best-effort notify admins; failure doesn't roll back the request.
  if (env.RESEND_API_KEY && env.RESEND_FROM) {
    try {
      const admins = await listAdminEmails(env.DB);
      const tpl = emailChangeRequestAdminEmail({
        appUrl: env.APP_URL,
        userEmail: user.email,
        requestedEmail: requested,
        userName: user.name,
      });
      await Promise.all(
        admins.map((to) =>
          sendEmail(
            { RESEND_API_KEY: env.RESEND_API_KEY!, RESEND_FROM: env.RESEND_FROM!, APP_URL: env.APP_URL },
            { to, ...tpl },
          ).catch((err) => console.warn(`admin notify failed for ${to}:`, err instanceof Error ? err.message : err)),
        ),
      );
    } catch (err) {
      console.warn("admin notify pipeline failed:", err instanceof Error ? err.message : err);
    }
  }

  return NextResponse.json({ status: "ok" }, { status: 201 });
}
