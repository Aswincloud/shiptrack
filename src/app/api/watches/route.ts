import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getEnv } from "@/lib/env";
import { createWatch, confirmWatch } from "@/lib/db";
import { getCarrier } from "@/carriers/registry";
import { readSession } from "@/lib/auth";

export const dynamic = "force-dynamic";

const Body = z.object({
  email: z.string().email().max(254),
  carrier: z.string().min(1).max(32),
  trackingNumber: z.string().min(4).max(40),
  label: z.string().max(80).optional(),
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

  const id = crypto.randomUUID();
  await createWatch(env.DB, {
    id,
    userId,
    email: email.toLowerCase(),
    carrier: carrier.toLowerCase(),
    trackingNumber: trackingNumber.trim(),
    label: label ?? null,
  });
  await confirmWatch(env.DB, id);

  return NextResponse.json({ status: "active", id }, { status: 201 });
}
