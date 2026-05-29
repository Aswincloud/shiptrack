import { NextRequest, NextResponse } from "next/server";
import { getEnv } from "@/lib/env";
import { requireAdmin } from "@/lib/auth";
import { getUserById } from "@/lib/db";
import {
  sendEmail,
  statusChangeEmail,
  otpEmail,
  watchCreatedEmail,
  passwordResetEmail,
} from "@/lib/email";

export const dynamic = "force-dynamic";

// Admin-only: renders each email template with sample data and sends them to
// the admin's own address so the design can be reviewed in a real inbox.
// GET /api/admin/test-email?type=status|otp|watch|reset|all
export async function GET(req: NextRequest) {
  const env = getEnv();
  if (!env.DB || !env.TOKEN_SECRET || !env.RESEND_API_KEY || !env.RESEND_FROM) {
    return NextResponse.json({ error: "not_configured" }, { status: 503 });
  }
  const gate = await requireAdmin(env.TOKEN_SECRET, env.DB, req);
  if (gate instanceof NextResponse) return gate;

  const admin = await getUserById(env.DB, gate.userId);
  if (!admin) return NextResponse.json({ error: "no_admin" }, { status: 400 });
  const to = admin.email;

  const type = new URL(req.url).searchParams.get("type") ?? "all";
  const emailEnv = { RESEND_API_KEY: env.RESEND_API_KEY, RESEND_FROM: env.RESEND_FROM, APP_URL: env.APP_URL };
  const unsub = `${env.APP_URL.replace(/\/$/, "")}/api/watches/unsubscribe?token=sample`;

  const samples: Record<string, () => { subject: string; html: string; text: string }> = {
    status: () =>
      statusChangeEmail({
        carrier: "bluedart",
        trackingNumber: "76989136991",
        label: "Mom's parcel",
        oldStatus: "out_for_delivery",
        newStatus: "delivered",
        description: "Shipment delivered to consignee",
        location: "Puducherry",
        timestamp: "29 May 11:01 AM",
        unsubscribeUrl: unsub,
      }),
    otp: () => otpEmail({ code: "428193", ttlMinutes: 10 }),
    watch: () =>
      watchCreatedEmail({
        appUrl: env.APP_URL,
        carrier: "shiprocket",
        trackingNumber: "76989136991",
        label: "Mom's parcel",
        currentStatus: "in_transit",
        unsubscribeUrl: unsub,
      }),
    reset: () => passwordResetEmail({ resetUrl: `${env.APP_URL}/reset?token=sample`, ttlHours: 1 }),
  };

  const types = type === "all" ? Object.keys(samples) : [type];
  const sent: string[] = [];
  const failed: { type: string; error: string }[] = [];

  for (const t of types) {
    const factory = samples[t];
    if (!factory) {
      failed.push({ type: t, error: "unknown_type" });
      continue;
    }
    const tpl = factory();
    try {
      await sendEmail(emailEnv, { to, subject: `[TEST] ${tpl.subject}`, html: tpl.html, text: tpl.text });
      sent.push(t);
    } catch (err) {
      failed.push({ type: t, error: err instanceof Error ? err.message : String(err) });
    }
  }

  return NextResponse.json({ to, sent, failed });
}
