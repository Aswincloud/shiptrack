import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getEnv } from "@/lib/env";
import { requireAdmin } from "@/lib/auth";
import { setWatchAdminHidden } from "@/lib/db";

export const dynamic = "force-dynamic";

const Body = z.object({ hidden: z.boolean() });

// Hide / unhide a row in the admin "Guest watch requests" list. Display-only:
// the watch keeps its status and the poller keeps treating it exactly as
// before. Admin session required.
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const env = getEnv();
  if (!env.DB || !env.TOKEN_SECRET) return NextResponse.json({ error: "not_configured" }, { status: 503 });
  const gate = await requireAdmin(env.TOKEN_SECRET, env.DB, req);
  if (gate instanceof NextResponse) return gate;

  const json = await req.json().catch(() => null);
  const parsed = Body.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: "invalid_input" }, { status: 400 });

  const { id } = await ctx.params;
  const ok = await setWatchAdminHidden(env.DB, id, parsed.data.hidden);
  if (!ok) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return NextResponse.json({ status: "ok", hidden: parsed.data.hidden });
}
