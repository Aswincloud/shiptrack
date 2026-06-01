import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getEnv } from "@/lib/env";
import { getUserById, updateUserName, deleteUser, countAdmins } from "@/lib/db";
import { readSession, clearSessionCookie } from "@/lib/auth";
import { verifyPassword } from "@/lib/passwords";

export const dynamic = "force-dynamic";

// OAuth-only accounts get this exact placeholder hash on creation (see
// /api/auth/oauth/[provider]/callback). It can't match any input.
const OAUTH_ONLY_HASH = "pbkdf2$100000$oauth_only$oauth_only";

export async function GET(req: NextRequest) {
  const env = getEnv();
  if (!env.DB || !env.TOKEN_SECRET) return NextResponse.json(null, { status: 200 });

  const sess = await readSession(env.TOKEN_SECRET, req);
  if (!sess) return NextResponse.json(null, { status: 200 });

  const user = await getUserById(env.DB, sess.userId);
  if (!user) return NextResponse.json(null, { status: 200 });

  return NextResponse.json({
    userId: user.id,
    email: user.email,
    name: user.name,
    isAdmin: user.is_admin === 1,
    hasPassword: user.password_hash !== OAUTH_ONLY_HASH,
    createdAt: user.created_at,
  });
}

const PatchBody = z.object({
  name: z.string().max(80).nullable(),
});

export async function PATCH(req: NextRequest) {
  const env = getEnv();
  if (!env.DB || !env.TOKEN_SECRET) return NextResponse.json({ error: "not_configured" }, { status: 503 });
  const sess = await readSession(env.TOKEN_SECRET, req);
  if (!sess) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const json = await req.json().catch(() => null);
  const parsed = PatchBody.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: "invalid_input" }, { status: 400 });

  await updateUserName(env.DB, sess.userId, parsed.data.name);
  return NextResponse.json({ status: "ok" });
}

const DeleteBody = z.object({
  // Password is required for accounts with a real password. OAuth-only accounts
  // must type the literal string "delete my account" (case-insensitive trim) as
  // a deliberate-action gate.
  password: z.string().optional(),
  confirm: z.string().optional(),
});

export async function DELETE(req: NextRequest) {
  const env = getEnv();
  if (!env.DB || !env.TOKEN_SECRET) return NextResponse.json({ error: "not_configured" }, { status: 503 });
  const sess = await readSession(env.TOKEN_SECRET, req);
  if (!sess) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const user = await getUserById(env.DB, sess.userId);
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  // Block deleting the last admin so we can never lock ourselves out.
  if (user.is_admin === 1) {
    const admins = await countAdmins(env.DB);
    if (admins <= 1) {
      return NextResponse.json(
        { error: "last_admin", message: "You're the only admin. Promote another user first." },
        { status: 409 },
      );
    }
  }

  const json = await req.json().catch(() => ({}));
  const parsed = DeleteBody.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: "invalid_input" }, { status: 400 });

  const hasRealPassword = user.password_hash !== OAUTH_ONLY_HASH;
  if (hasRealPassword) {
    if (!parsed.data.password) {
      return NextResponse.json({ error: "password_required" }, { status: 400 });
    }
    const ok = await verifyPassword(parsed.data.password, user.password_hash);
    if (!ok) return NextResponse.json({ error: "invalid_credentials" }, { status: 401 });
  } else {
    // OAuth-only — require the confirm phrase.
    if ((parsed.data.confirm ?? "").trim().toLowerCase() !== "delete my account") {
      return NextResponse.json({ error: "confirm_required" }, { status: 400 });
    }
  }

  await deleteUser(env.DB, user.id);

  // Drop the session cookie on the way out.
  const res = NextResponse.json({ status: "deleted" });
  res.headers.set("Set-Cookie", clearSessionCookie());
  return res;
}
