import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getEnv } from "@/lib/env";
import { updateUserResendKey } from "@/lib/db";
import { readSession } from "@/lib/auth";

export const dynamic = "force-dynamic";

const Body = z.object({ key: z.string().min(10).max(200) });

export async function PUT(req: NextRequest) {
  const env = getEnv();
  if (!env.DB || !env.TOKEN_SECRET) {
    return NextResponse.json({ error: "not_configured" }, { status: 503 });
  }
  const sess = await readSession(env.TOKEN_SECRET, req);
  if (!sess) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const json = await req.json().catch(() => null);
  const parsed = Body.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_input" }, { status: 400 });
  }

  await updateUserResendKey(env.DB, sess.userId, parsed.data.key);
  return NextResponse.json({ status: "ok" });
}

export async function DELETE(req: NextRequest) {
  const env = getEnv();
  if (!env.DB || !env.TOKEN_SECRET) {
    return NextResponse.json({ error: "not_configured" }, { status: 503 });
  }
  const sess = await readSession(env.TOKEN_SECRET, req);
  if (!sess) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  await updateUserResendKey(env.DB, sess.userId, null);
  return NextResponse.json({ status: "ok" });
}
