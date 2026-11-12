import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getEnv } from "@/lib/env";
import { readSession } from "@/lib/auth";
import { getUserById } from "@/lib/db";
import { countActiveApiKeys, createApiKey, listApiKeys, MAX_API_KEYS_PER_USER } from "@/lib/api-keys";

export const dynamic = "force-dynamic";

// Managing keys needs the session cookie, never a key: a leaked key must not be
// able to mint more keys or list its siblings.

export async function GET(req: NextRequest) {
  const env = getEnv();
  if (!env.DB || !env.TOKEN_SECRET) return NextResponse.json({ error: "not_configured" }, { status: 503 });
  const sess = await readSession(env.TOKEN_SECRET, req);
  if (!sess) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  return NextResponse.json({ keys: await listApiKeys(env.DB, sess.userId), max: MAX_API_KEYS_PER_USER });
}

const Body = z.object({ name: z.string().trim().min(1).max(60) });

export async function POST(req: NextRequest) {
  const env = getEnv();
  if (!env.DB || !env.TOKEN_SECRET) return NextResponse.json({ error: "not_configured" }, { status: 503 });
  const sess = await readSession(env.TOKEN_SECRET, req);
  if (!sess) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const user = await getUserById(env.DB, sess.userId);
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_input", message: "Give the key a name (up to 60 characters)." }, { status: 400 });
  }
  if ((await countActiveApiKeys(env.DB, user.id)) >= MAX_API_KEYS_PER_USER) {
    return NextResponse.json(
      { error: "key_limit_reached", message: `You can have up to ${MAX_API_KEYS_PER_USER} active keys. Revoke one to create another.` },
      { status: 409 },
    );
  }
  const { key, summary } = await createApiKey(env.DB, user.id, parsed.data.name);
  // The only time the clear key leaves the server.
  return NextResponse.json({ key, ...summary }, { status: 201, headers: { "Cache-Control": "no-store" } });
}
