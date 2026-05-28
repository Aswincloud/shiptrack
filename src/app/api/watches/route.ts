import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getEnv } from "@/lib/env";
import {
  createWatch,
  confirmWatch,
  MIN_POLL_INTERVAL_SECONDS,
  MAX_POLL_INTERVAL_SECONDS,
} from "@/lib/db";
import { getCarrier } from "@/carriers/registry";
import { readSession } from "@/lib/auth";
import { signToken } from "@/lib/tokens";
import { sendEmail, watchCreatedEmail } from "@/lib/email";

export const dynamic = "force-dynamic";

const Body = z.object({
  email: z.string().email().max(254),
  carrier: z.string().min(1).max(32),
  trackingNumber: z.string().min(4).max(40),
  label: z.string().max(80).optional(),
  pollIntervalSeconds: z
    .number()
    .int()
    .min(MIN_POLL_INTERVAL_SECONDS)
    .max(MAX_POLL_INTERVAL_SECONDS)
    .optional(),
});

export async function POST(req: NextRequest) {
  const env = getEnv();
  if (!env.DB || !env.TOKEN_SECRET) {
    return NextResponse.json({ error: "not_configured" }, { status: 503 });
  }

  // Auth: prefer session cookie. Fall back to ADMIN_TOKEN bearer for legacy /
  // owner curl flow. One of the two must succeed.
  const session = await readSession(env.TOKEN_SECRET, req);
  let userId: string | null = null;
  if (session) {
    userId = session.userId;
  } else {
    const auth = req.headers.get("authorization") ?? "";
    const provided = auth.startsWith("Bearer ") ? auth.slice(7) : "";
    if (!env.ADMIN_TOKEN || !provided || provided !== env.ADMIN_TOKEN) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
  }

  const json = await req.json().catch(() => null);
  const parsed = Body.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_input", details: parsed.error.flatten() }, { status: 400 });
  }
  const { email, carrier, trackingNumber, label } = parsed.data;

  if (!getCarrier(carrier)) {
    return NextResponse.json({ error: "carrier_not_supported" }, { status: 400 });
  }

  const cleanedEmail = email.toLowerCase();
  const cleanedCarrier = carrier.toLowerCase();
  const cleanedTracking = trackingNumber.trim();
  const cleanedLabel = label ?? null;

  const id = crypto.randomUUID();
  await createWatch(env.DB, {
    id,
    userId,
    email: cleanedEmail,
    carrier: cleanedCarrier,
    trackingNumber: cleanedTracking,
    label: cleanedLabel,
    pollIntervalSeconds: parsed.data.pollIntervalSeconds,
  });
  await confirmWatch(env.DB, id);

  // Best-effort confirmation email so the user knows the watch is registered
  // and has an immediate unsubscribe link.
  if (env.RESEND_API_KEY && env.RESEND_FROM) {
    const unsubToken = await signToken(env.TOKEN_SECRET, id, "unsubscribe");
    const unsubscribeUrl = `${env.APP_URL.replace(/\/$/, "")}/api/watches/unsubscribe?token=${encodeURIComponent(unsubToken)}`;

    const tpl = watchCreatedEmail({
      appUrl: env.APP_URL,
      carrier: cleanedCarrier,
      trackingNumber: cleanedTracking,
      label: cleanedLabel,
      unsubscribeUrl,
    });
    try {
      await sendEmail(
        { RESEND_API_KEY: env.RESEND_API_KEY, RESEND_FROM: env.RESEND_FROM, APP_URL: env.APP_URL },
        { to: cleanedEmail, ...tpl },
      );
    } catch (err) {
      console.warn("watch confirmation email failed:", err instanceof Error ? err.message : err);
    }
  }

  return NextResponse.json({ status: "active", id }, { status: 201 });
}
