import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getEnv } from "@/lib/env";
import { confirmEmailChange } from "@aswincloud/auth/d1";

export const dynamic = "force-dynamic";

const Body = z.object({ token: z.string().min(10) });

// POST — finish a self-service email change. The token (sent to the NEW address)
// binds both the userId and the target email, so it can't be retargeted.
export async function POST(req: NextRequest) {
  const env = getEnv();
  if (!env.DB || !env.TOKEN_SECRET) {
    return NextResponse.json({ error: "not_configured" }, { status: 503 });
  }

  const json = await req.json().catch(() => null);
  const parsed = Body.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: "invalid_input" }, { status: 400 });

  const r = await confirmEmailChange(env.DB, { token: parsed.data.token, secret: env.TOKEN_SECRET });
  if (!r.ok) {
    const status = r.error === "email_taken" ? 409 : 400;
    return NextResponse.json({ error: r.error }, { status });
  }
  return NextResponse.json({ status: "ok", email: r.email });
}
