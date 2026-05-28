import { NextRequest, NextResponse } from "next/server";
import { getEnv } from "@/lib/env";
import {
  buildAuthorizeUrl,
  createState,
  isProviderConfigured,
  stateCookie,
  type ProviderId,
} from "@/lib/oauth";

export const dynamic = "force-dynamic";

const SUPPORTED: ProviderId[] = ["google", "github", "microsoft"];

export async function GET(req: NextRequest, ctx: { params: Promise<{ provider: string }> }) {
  const env = getEnv();
  if (!env.TOKEN_SECRET) {
    return NextResponse.json({ error: "not_configured" }, { status: 503 });
  }
  const { provider } = await ctx.params;
  if (!SUPPORTED.includes(provider as ProviderId)) {
    return NextResponse.json({ error: "unknown_provider" }, { status: 404 });
  }
  if (!isProviderConfigured(provider as ProviderId, env)) {
    return NextResponse.json({ error: "provider_not_configured" }, { status: 503 });
  }

  const state = await createState(env.TOKEN_SECRET);
  const url = buildAuthorizeUrl(provider as ProviderId, env, state);
  const res = NextResponse.redirect(url, { status: 303 });
  res.headers.set("Set-Cookie", stateCookie(state));
  return res;
}
