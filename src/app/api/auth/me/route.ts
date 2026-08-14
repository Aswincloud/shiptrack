import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getEnv } from "@/lib/env";
import { getUserById } from "@/lib/db";
import { readSession, clearSessionCookie } from "@/lib/auth";
import { changeUsername, removeUser, hasRealPassword } from "@aswincloud/auth/d1";

export const dynamic = "force-dynamic";

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
    hasPassword: hasRealPassword(user),
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

  const r = await changeUsername(env.DB, { userId: sess.userId, name: parsed.data.name });
  if (!r.ok) return NextResponse.json({ error: "unauthorized" }, { status: 401 }); // not_found
  return NextResponse.json({ status: "ok" });
}

const DeleteBody = z.object({
  // Password is required for accounts with a real password. OAuth-only accounts
  // must type the literal "delete my account" as a deliberate-action gate.
  password: z.string().optional(),
  confirm: z.string().optional(),
});

export async function DELETE(req: NextRequest) {
  const env = getEnv();
  if (!env.DB || !env.TOKEN_SECRET) return NextResponse.json({ error: "not_configured" }, { status: 503 });
  const sess = await readSession(env.TOKEN_SECRET, req);
  if (!sess) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const json = await req.json().catch(() => ({}));
  const parsed = DeleteBody.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: "invalid_input" }, { status: 400 });

  // The flow enforces: last-admin guard, password for real-pw accounts, and the
  // "delete my account" confirm phrase for OAuth-only accounts.
  const r = await removeUser(env.DB, {
    userId: sess.userId,
    currentPassword: parsed.data.password,
    confirmPhrase: parsed.data.confirm,
    protectLastAdmin: true,
  });
  if (!r.ok) {
    switch (r.error) {
      case "not_found": return NextResponse.json({ error: "unauthorized" }, { status: 401 });
      case "last_admin":
        return NextResponse.json(
          { error: "last_admin", message: "You're the only admin. Promote another user first." },
          { status: 409 },
        );
      case "password_required": return NextResponse.json({ error: "password_required" }, { status: 400 });
      case "invalid_credentials": return NextResponse.json({ error: "invalid_credentials" }, { status: 401 });
      case "confirm_required": return NextResponse.json({ error: "confirm_required" }, { status: 400 });
    }
  }

  // Drop the session cookie on the way out.
  const res = NextResponse.json({ status: "deleted" });
  res.headers.set("Set-Cookie", clearSessionCookie());
  return res;
}
