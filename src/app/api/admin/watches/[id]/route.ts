import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getEnv } from "@/lib/env";
import { requireAdmin } from "@/lib/auth";
import { cancelWatch, getWatch, setWatchAdminHidden } from "@/lib/db";

export const dynamic = "force-dynamic";

// Either hide/unhide (display-only) or cancel (stops polling and alerts).
const Body = z.union([z.object({ hidden: z.boolean() }), z.object({ cancel: z.literal(true) })]);

// Admin actions on a row in "Guest watch requests". Admin session required.
//  - { hidden }: hide/unhide in the list. Display-only; status untouched.
//  - { cancel: true }: cancel the watch. The poller only reads active rows, so
//    polling and alerts stop. Restricted to guest watches (no owning account):
//    an account holder's watch is theirs to cancel from their dashboard.
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const env = getEnv();
  if (!env.DB || !env.TOKEN_SECRET) return NextResponse.json({ error: "not_configured" }, { status: 503 });
  const gate = await requireAdmin(env.TOKEN_SECRET, env.DB, req);
  if (gate instanceof NextResponse) return gate;

  const json = await req.json().catch(() => null);
  const parsed = Body.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: "invalid_input" }, { status: 400 });

  const { id } = await ctx.params;
  if ("cancel" in parsed.data) {
    const w = await getWatch(env.DB, id);
    if (!w || w.user_id) return NextResponse.json({ error: "not_found" }, { status: 404 });
    await cancelWatch(env.DB, id);
    return NextResponse.json({ status: "cancelled" });
  }
  const ok = await setWatchAdminHidden(env.DB, id, parsed.data.hidden);
  if (!ok) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return NextResponse.json({ status: "ok", hidden: parsed.data.hidden });
}
