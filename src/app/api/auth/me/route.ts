import { NextRequest, NextResponse } from "next/server";
import { getEnv } from "@/lib/env";
import { getUserById } from "@/lib/db";
import { readSession } from "@/lib/auth";

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
    resendKeyConfigured: !!user.resend_api_key,
  });
}
