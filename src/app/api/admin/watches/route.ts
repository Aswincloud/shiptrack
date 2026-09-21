import { NextRequest, NextResponse } from "next/server";
import { getEnv } from "@/lib/env";
import { requireAdmin } from "@/lib/auth";
import { listWatchRequestsForAdmin } from "@/lib/db";

export const dynamic = "force-dynamic";

// Watches with no owning account — signed-out visitors' alert requests, plus
// anything registered through the ADMIN_TOKEN curl flow.
export async function GET(req: NextRequest) {
  const env = getEnv();
  if (!env.DB || !env.TOKEN_SECRET) {
    return NextResponse.json({ error: "not_configured" }, { status: 503 });
  }
  const gate = await requireAdmin(env.TOKEN_SECRET, env.DB, req);
  if (gate instanceof NextResponse) return gate;

  const watches = await listWatchRequestsForAdmin(env.DB);
  return NextResponse.json({ watches });
}
