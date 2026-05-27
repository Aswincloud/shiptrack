import { NextRequest, NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { z } from "zod";
import { createWatch, confirmWatch } from "@/lib/db";
import { getCarrier } from "@/carriers/registry";

export const dynamic = "force-dynamic";

const Body = z.object({
  email: z.string().email().max(254),
  carrier: z.string().min(1).max(32),
  trackingNumber: z.string().min(4).max(40),
  label: z.string().max(80).optional(),
});

export async function POST(req: NextRequest) {
  const { env } = getCloudflareContext();
  const e = env as unknown as {
    DB: import("@cloudflare/workers-types").D1Database;
    ADMIN_TOKEN: string;
  };
  if (!e.DB || !e.ADMIN_TOKEN) {
    return NextResponse.json({ error: "not_configured" }, { status: 503 });
  }

  const auth = req.headers.get("authorization") ?? "";
  const provided = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!provided || provided !== e.ADMIN_TOKEN) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
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
  await createWatch(e.DB, {
    id,
    email: email.toLowerCase(),
    carrier: carrier.toLowerCase(),
    trackingNumber: trackingNumber.trim(),
    label: label ?? null,
  });
  await confirmWatch(e.DB, id);

  return NextResponse.json({ status: "active", id }, { status: 201 });
}
