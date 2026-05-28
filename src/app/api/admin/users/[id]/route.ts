import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getEnv } from "@/lib/env";
import { requireAdmin } from "@/lib/auth";
import { getUserById, updateUserEmail } from "@/lib/db";

export const dynamic = "force-dynamic";

const PatchBody = z.object({
  email: z.string().email().max(254).optional(),
});

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const env = getEnv();
  if (!env.DB || !env.TOKEN_SECRET) {
    return NextResponse.json({ error: "not_configured" }, { status: 503 });
  }
  const gate = await requireAdmin(env.TOKEN_SECRET, env.DB, req);
  if (gate instanceof NextResponse) return gate;

  const { id } = await ctx.params;
  const target = await getUserById(env.DB, id);
  if (!target) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const json = await req.json().catch(() => null);
  const parsed = PatchBody.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_input" }, { status: 400 });
  }

  if (parsed.data.email) {
    const r = await updateUserEmail(env.DB, id, parsed.data.email.toLowerCase());
    if (!r.ok) {
      return NextResponse.json(
        { error: r.conflict ? "email_in_use" : "update_failed" },
        { status: 400 },
      );
    }
  }

  return NextResponse.json({ status: "ok" });
}
