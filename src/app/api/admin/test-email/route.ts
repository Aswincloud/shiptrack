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

  // A fixed list, filtered by the request — never a lookup keyed by the
  // request. The function that gets called is always taken from this literal
  // array; `type` only decides which entries are included. So neither an
  // Object.prototype name (constructor, __proto__) nor anything else the caller
  // sends can pick a callee. (CodeQL js/unvalidated-dynamic-method-call.)
  const samples: { type: string; render: () => { subject: string; html: string; text: string } }[] = [
    {
      type: "status",
      render: () =>
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
    },
    { type: "otp", render: () => otpEmail({ code: "428193", ttlMinutes: 10 }) },
    {
      type: "watch",
      render: () =>
        watchCreatedEmail({
          appUrl: env.APP_URL,
          carrier: "shiprocket",
          trackingNumber: "76989136991",
          label: "Mom's parcel",
          currentStatus: "in_transit",
          unsubscribeUrl: unsub,
        }),
    },
    { type: "reset", render: () => passwordResetEmail({ resetUrl: `${env.APP_URL}/reset?token=sample`, ttlHours: 1 }) },
  ];

  const known = samples.map((s) => s.type);
  const requested = type === "all" ? known : [type];
  const sent: string[] = [];
  const failed: { type: string; error: string }[] = requested
    .filter((t) => !known.includes(t))
    .map((t) => ({ type: t, error: "unknown_type" }));

  for (const sample of samples) {
    if (!requested.includes(sample.type)) continue;
    const tpl = sample.render();
    try {
      await sendEmail(emailEnv, { to, subject: `[TEST] ${tpl.subject}`, html: tpl.html, text: tpl.text });
      sent.push(sample.type);
    } catch (err) {
      failed.push({ type: sample.type, error: err instanceof Error ? err.message : String(err) });
    }
  }

  return NextResponse.json({ to, sent, failed });
}
