import { NextRequest, NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { z } from "zod";
import { createWatch } from "@/lib/db";
import { signToken } from "@/lib/tokens";
import { sendEmail, confirmEmail } from "@/lib/email";
import { getCarrier } from "@/carriers/registry";

export const dynamic = "force-dynamic";

const Body = z.object({
  email: z.string().email().max(254),
  carrier: z.string().min(1).max(32),
  trackingNumber: z.string().min(4).max(40),
  label: z.string().max(80).optional(),
});

export async function POST(req: NextRequest) {
  const json = await req.json().catch(() => null);
  const parsed = Body.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_input", details: parsed.error.flatten() }, { status: 400 });
  }
  const { email, carrier, trackingNumber, label } = parsed.data;

  if (!getCarrier(carrier)) {
    return NextResponse.json({ error: "carrier_not_supported" }, { status: 400 });
  }

  const { env } = getCloudflareContext();
  const e = env as unknown as {
    DB: import("@cloudflare/workers-types").D1Database;
    TOKEN_SECRET: string;
    RESEND_API_KEY: string;
    RESEND_FROM: string;
    APP_URL: string;
  };
  if (!e.DB || !e.TOKEN_SECRET || !e.RESEND_API_KEY || !e.RESEND_FROM || !e.APP_URL) {
    return NextResponse.json({ error: "not_configured" }, { status: 503 });
  }

  const id = crypto.randomUUID();
  await createWatch(e.DB, {
    id,
    email: email.toLowerCase(),
    carrier: carrier.toLowerCase(),
    trackingNumber: trackingNumber.trim(),
    label: label ?? null,
  });

  const token = await signToken(e.TOKEN_SECRET, id, "confirm", 7 * 24 * 3600);
  const confirmUrl = `${e.APP_URL.replace(/\/$/, "")}/api/watches/confirm?token=${encodeURIComponent(token)}`;
  const msg = confirmEmail({
    appUrl: e.APP_URL,
    confirmUrl,
    carrier,
    trackingNumber: trackingNumber.trim(),
    label,
  });

  try {
    await sendEmail(
      { RESEND_API_KEY: e.RESEND_API_KEY, RESEND_FROM: e.RESEND_FROM, APP_URL: e.APP_URL },
      { to: email, ...msg },
    );
  } catch (err) {
    return NextResponse.json(
      { error: "email_send_failed", message: err instanceof Error ? err.message : "unknown" },
      { status: 502 },
    );
  }

  return NextResponse.json({ status: "pending", id }, { status: 202 });
}
