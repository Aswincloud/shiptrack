import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getEnv } from "@/lib/env";
import { requireAdmin } from "@/lib/auth";
import {
  decideEmailChangeRequest,
  getEmailChangeRequestById,
  getUserByEmail,
  updateUserEmail,
} from "@/lib/db";
import {
  sendEmail,
  emailChangeApprovedEmail,
  emailChangeRejectedEmail,
} from "@/lib/email";

export const dynamic = "force-dynamic";

const Body = z.object({
  action: z.enum(["approve", "reject"]),
  reason: z.string().max(280).optional(),
});

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const env = getEnv();
  if (!env.DB || !env.TOKEN_SECRET) return NextResponse.json({ error: "not_configured" }, { status: 503 });
  const gate = await requireAdmin(env.TOKEN_SECRET, env.DB, req);
  if (gate instanceof NextResponse) return gate;

  const { id } = await ctx.params;
  const json = await req.json().catch(() => null);
  const parsed = Body.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: "invalid_input" }, { status: 400 });

  const reqRow = await getEmailChangeRequestById(env.DB, id);
  if (!reqRow || reqRow.status !== "pending") {
    return NextResponse.json({ error: "not_found_or_decided" }, { status: 404 });
  }

  if (parsed.data.action === "approve") {
    // Re-check email is still available now (someone may have signed up with it
    // between request submission and admin approval).
    const collision = await getUserByEmail(env.DB, reqRow.requested_email);
    if (collision && collision.id !== reqRow.user_id) {
      return NextResponse.json({ error: "email_taken" }, { status: 409 });
    }

    await updateUserEmail(env.DB, reqRow.user_id, reqRow.requested_email);
    await decideEmailChangeRequest(env.DB, {
      id,
      adminId: gate.userId,
      status: "approved",
      reason: parsed.data.reason,
    });

    if (env.RESEND_API_KEY && env.RESEND_FROM) {
      const tpl = emailChangeApprovedEmail({
        appUrl: env.APP_URL,
        oldEmail: reqRow.current_email,
        newEmail: reqRow.requested_email,
      });
      // Notify both old + new mailboxes so the user always sees it.
      await Promise.all(
        [reqRow.current_email, reqRow.requested_email].map((to) =>
          sendEmail(
            { RESEND_API_KEY: env.RESEND_API_KEY!, RESEND_FROM: env.RESEND_FROM!, APP_URL: env.APP_URL },
            { to, ...tpl },
          ).catch((err) =>
            console.warn(`approval notify failed for ${to}:`, err instanceof Error ? err.message : err),
          ),
        ),
      );
    }
    return NextResponse.json({ status: "approved" });
  }

  // Reject
  await decideEmailChangeRequest(env.DB, {
    id,
    adminId: gate.userId,
    status: "rejected",
    reason: parsed.data.reason,
  });

  if (env.RESEND_API_KEY && env.RESEND_FROM) {
    const tpl = emailChangeRejectedEmail({
      appUrl: env.APP_URL,
      requestedEmail: reqRow.requested_email,
      reason: parsed.data.reason,
    });
    await sendEmail(
      { RESEND_API_KEY: env.RESEND_API_KEY, RESEND_FROM: env.RESEND_FROM, APP_URL: env.APP_URL },
      { to: reqRow.current_email, ...tpl },
    ).catch((err) =>
      console.warn(`rejection notify failed for ${reqRow.current_email}:`, err instanceof Error ? err.message : err),
    );
  }
  return NextResponse.json({ status: "rejected" });
}
