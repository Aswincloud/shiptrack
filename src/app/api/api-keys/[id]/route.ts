import { NextRequest, NextResponse } from "next/server";
import { getEnv } from "@/lib/env";
import { readSession } from "@/lib/auth";
import { revokeApiKey } from "@/lib/api-keys";

export const dynamic = "force-dynamic";

// Revoke one of the signed-in user's keys. Session only, like creation.
export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const env = getEnv();
  if (!env.DB || !env.TOKEN_SECRET) return NextResponse.json({ error: "not_configured" }, { status: 503 });
  const sess = await readSession(env.TOKEN_SECRET, req);
  if (!sess) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  const ok = await revokeApiKey(env.DB, sess.userId, id);
  if (!ok) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return new NextResponse(null, { status: 204 });
}
