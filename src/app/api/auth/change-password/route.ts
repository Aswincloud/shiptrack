import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getEnv } from "@/lib/env";
import { getUserById, updateUserPasswordHash } from "@/lib/db";
import { readSession } from "@/lib/auth";
import { hashPassword, verifyPassword } from "@/lib/passwords";

export const dynamic = "force-dynamic";

const OAUTH_ONLY_HASH = "pbkdf2$100000$oauth_only$oauth_only";

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

  const user = await getUserById(env.DB, sess.userId);
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const json = await req.json().catch(() => null);
  const parsed = Body.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: "invalid_input" }, { status: 400 });

  const hasRealPassword = user.password_hash !== OAUTH_ONLY_HASH;
  if (hasRealPassword) {
    if (!parsed.data.currentPassword) {
      return NextResponse.json({ error: "current_password_required" }, { status: 400 });
    }
    const ok = await verifyPassword(parsed.data.currentPassword, user.password_hash);
    if (!ok) return NextResponse.json({ error: "invalid_credentials" }, { status: 401 });
  }
  // For OAuth-only accounts, setting the first password doesn't require a
  // current one (they have nothing to verify against). They're already
  // authenticated via the session cookie issued during OAuth login.

  const newHash = await hashPassword(parsed.data.newPassword);
  await updateUserPasswordHash(env.DB, user.id, newHash);
  return NextResponse.json({ status: "ok" });
}
