import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getEnv } from "@/lib/env";
import {
  cancelWatchForUser,
  confirmWatch,
  getUserById,
  getWatchForUser,
  setWatchPendingForUser,
  updateWatchForUser,
  MIN_POLL_INTERVAL_SECONDS,
  MAX_POLL_INTERVAL_SECONDS,
} from "@/lib/db";
import { readSession } from "@/lib/auth";
import { signToken } from "@/lib/tokens";
import { sendEmail, confirmEmail } from "@/lib/email";

export const dynamic = "force-dynamic";

const CONFIRM_TTL_SECONDS = 7 * 24 * 60 * 60;

const PatchBody = z.object({
  label: z.string().max(80).nullable().optional(),
  email: z.string().email().max(254).optional(),
  pollIntervalSeconds: z
    .number()
    .int()
    .min(MIN_POLL_INTERVAL_SECONDS)
    .max(MAX_POLL_INTERVAL_SECONDS)
    .optional(),
});

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const env = getEnv();
  if (!env.DB || !env.TOKEN_SECRET) {
    return NextResponse.json({ error: "not_configured" }, { status: 503 });
  }
  const sess = await readSession(env.TOKEN_SECRET, req);
  if (!sess) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await ctx.params;
  const ok = await cancelWatchForUser(env.DB, id, sess.userId);
  if (!ok) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return new NextResponse(null, { status: 204 });
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const env = getEnv();
  if (!env.DB || !env.TOKEN_SECRET) {
    return NextResponse.json({ error: "not_configured" }, { status: 503 });
  }
  const sess = await readSession(env.TOKEN_SECRET, req);
  if (!sess) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const json = await req.json().catch(() => null);
  const parsed = PatchBody.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_input" }, { status: 400 });
  }

  const { id } = await ctx.params;
  const user = await getUserById(env.DB, sess.userId);
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const nextEmail = parsed.data.email?.toLowerCase();
  // Same rule as creation: repointing a watch at someone else's address parks it
  // until that person confirms, so an edit can't be used to route mail at a
  // stranger. Moving it back to your own address needs no confirmation.
  const needsConfirmation = nextEmail !== undefined && nextEmail !== user.email.toLowerCase();

  const mailConfigured = !!(env.RESEND_API_KEY && env.RESEND_FROM);
  if (needsConfirmation && !mailConfigured) {
    return NextResponse.json({ error: "not_configured" }, { status: 503 });
  }

  const ok = await updateWatchForUser(env.DB, id, sess.userId, {
    label: parsed.data.label === undefined ? undefined : parsed.data.label,
    email: nextEmail,
    pollIntervalSeconds: parsed.data.pollIntervalSeconds,
  });
  if (!ok) return NextResponse.json({ error: "not_found" }, { status: 404 });

  if (nextEmail === undefined) return NextResponse.json({ status: "ok" });

  if (!needsConfirmation) {
    // Back to the owner's own address — release it if a previous edit had left
    // it awaiting someone else's confirmation.
    await confirmWatch(env.DB, id);
    return NextResponse.json({ status: "ok", pendingConfirmation: false });
  }

  const parked = await setWatchPendingForUser(env.DB, id, sess.userId);
  if (!parked) {
    // Watch is completed or cancelled — nothing is going to be mailed from it,
    // so the address change stands on its own without a confirmation round.
    return NextResponse.json({ status: "ok", pendingConfirmation: false });
  }

  const watch = await getWatchForUser(env.DB, id, sess.userId);
  const appUrl = env.APP_URL.replace(/\/$/, "");
  const confirmToken = await signToken(env.TOKEN_SECRET, id, "confirm", CONFIRM_TTL_SECONDS);
  const confirmUrl = `${appUrl}/api/watches/confirm?token=${encodeURIComponent(confirmToken)}`;
  const tpl = confirmEmail({
    appUrl: env.APP_URL,
    confirmUrl,
    carrier: watch?.carrier ?? "",
    trackingNumber: watch?.tracking_number ?? "",
    label: watch?.label ?? null,
  });
  try {
    await sendEmail(
      { RESEND_API_KEY: env.RESEND_API_KEY, RESEND_FROM: env.RESEND_FROM, APP_URL: env.APP_URL },
      { to: nextEmail, ...tpl },
    );
  } catch (err) {
    console.error("watch confirmation email failed:", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "send_failed" }, { status: 502 });
  }

  return NextResponse.json({ status: "ok", pendingConfirmation: true });
}
