import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getEnv } from "@/lib/env";
import {
  cancelWatchForUser,
  updateWatchForUser,
  MIN_POLL_INTERVAL_SECONDS,
  MAX_POLL_INTERVAL_SECONDS,
} from "@/lib/db";
import { readSession } from "@/lib/auth";

export const dynamic = "force-dynamic";

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
  const ok = await updateWatchForUser(env.DB, id, sess.userId, {
    label: parsed.data.label === undefined ? undefined : parsed.data.label,
    email: parsed.data.email === undefined ? undefined : parsed.data.email.toLowerCase(),
    pollIntervalSeconds: parsed.data.pollIntervalSeconds,
  });
  if (!ok) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return NextResponse.json({ status: "ok" });
}
