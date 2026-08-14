import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getEnv } from "@/lib/env";
import { readSession } from "@/lib/auth";
import { changePassword } from "@aswincloud/auth/d1";

export const dynamic = "force-dynamic";

const Body = z.object({
  // Optional only when the account has never had a real password (OAuth-only).
  currentPassword: z.string().min(1).optional(),
  newPassword: z.string().min(8).max(200),
});

export async function POST(req: NextRequest) {
  const env = getEnv();
  if (!env.DB || !env.TOKEN_SECRET) return NextResponse.json({ error: "not_configured" }, { status: 503 });

  const sess = await readSession(env.TOKEN_SECRET, req);
  if (!sess) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const json = await req.json().catch(() => null);
  const parsed = Body.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: "invalid_input" }, { status: 400 });

  // The flow honors the OAUTH_ONLY_HASH sentinel: OAuth-only accounts set a
  // first password without a current one (they're authed via the session).
  const r = await changePassword(env.DB, {
    userId: sess.userId,
    currentPassword: parsed.data.currentPassword,
    newPassword: parsed.data.newPassword,
  });
  if (!r.ok) {
    if (r.error === "not_found") return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    if (r.error === "current_password_required") return NextResponse.json({ error: "current_password_required" }, { status: 400 });
    if (r.error === "invalid_credentials") return NextResponse.json({ error: "invalid_credentials" }, { status: 401 });
    return NextResponse.json({ error: "invalid_input" }, { status: 400 }); // weak_password
  }
  return NextResponse.json({ status: "ok" });
}
