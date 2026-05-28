import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getEnv } from "@/lib/env";
import { updateUserPasswordHash } from "@/lib/db";
import { verifyToken } from "@/lib/tokens";
import { hashPassword } from "@/lib/passwords";

export const dynamic = "force-dynamic";

const Body = z.object({
  token: z.string().min(10),
  password: z.string().min(8).max(200),
});

export async function POST(req: NextRequest) {
  const env = getEnv();
  if (!env.DB || !env.TOKEN_SECRET) {
    return NextResponse.json({ error: "not_configured" }, { status: 503 });
  }

  const json = await req.json().catch(() => null);
  const parsed = Body.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_input" }, { status: 400 });
  }

  const userId = await verifyToken(env.TOKEN_SECRET, parsed.data.token, "password_reset");
  if (!userId) return NextResponse.json({ error: "invalid_token" }, { status: 400 });

  const passwordHash = await hashPassword(parsed.data.password);
  await updateUserPasswordHash(env.DB, userId, passwordHash);

  return NextResponse.json({ status: "ok" });
}
