import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getEnv } from "@/lib/env";
import { verifyOtp } from "@aswincloud/auth/d1";
import { createSessionCookie } from "@/lib/auth";

export const dynamic = "force-dynamic";

const Body = z.object({
  email: z.string().email().max(254),
  code: z.string().regex(/^\d{6}$/),
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

  const r = await verifyOtp(env.DB, {
    email: parsed.data.email.toLowerCase(),
    code: parsed.data.code,
    secret: env.TOKEN_SECRET,
  });
  if (!r.ok) {
    const status = r.error === "too_many_attempts" ? 429 : 400;
    // "no_account"/"expired" both surface as recoverable client errors, same as before.
    return NextResponse.json({ error: r.error }, { status });
  }

  const cookie = await createSessionCookie(env.TOKEN_SECRET, r.userId);
  return NextResponse.json(
    { userId: r.userId, email: r.email },
    { status: 200, headers: { "Set-Cookie": cookie } },
  );
}
