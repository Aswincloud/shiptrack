import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getEnv } from "@/lib/env";
import { resetPassword } from "@aswincloud/auth/d1";
import { revokeAllApiKeys } from "@/lib/api-keys";

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

  const r = await resetPassword(env.DB, {
    token: parsed.data.token,
    newPassword: parsed.data.password,
    secret: env.TOKEN_SECRET,
  });
  if (!r.ok) {
    // invalid_token | weak_password (zod already guards length, so token is the usual case)
    return NextResponse.json({ error: r.error === "weak_password" ? "invalid_input" : "invalid_token" }, { status: 400 });
  }
  // A reset is the account-recovery / compromise path (self-service "forgot
  // password" or an admin force-reset), so retire the account's API keys too:
  // a key leaked alongside the password must not outlive the reset. A routine
  // change-password, by contrast, leaves keys in place.
  await revokeAllApiKeys(env.DB, r.userId);
  return NextResponse.json({ status: "ok" });
}
