import { NextRequest } from "next/server";
import { getEnv } from "@/lib/env";
import { startOAuth, type ProviderId } from "@aswincloud/auth";
import { oauthConfig, brokerConfigured, brokerStart } from "@/lib/authpkg";

export const dynamic = "force-dynamic";

const SUPPORTED: ProviderId[] = ["google", "github", "microsoft"];

export async function GET(_req: NextRequest, ctx: { params: Promise<{ provider: string }> }) {
  const env = getEnv();
  if (!env.TOKEN_SECRET) {
    return Response.json({ error: "not_configured" }, { status: 503 });
  }
  const { provider } = await ctx.params;
  if (!SUPPORTED.includes(provider as ProviderId)) {
    return Response.json({ error: "unknown_provider" }, { status: 404 });
  }

  // Preferred path: relay through the central broker (no per-site OAuth client).
  if (brokerConfigured(env)) {
    const { location, setCookie } = await brokerStart(env, provider as ProviderId);
    return new Response(null, { status: 302, headers: { Location: location, "Set-Cookie": setCookie } });
  }

  // Fallback: shiptrack's own provider client. startOAuth returns a 302 with the
  // signed state cookie, or a 503 Response if the provider has no credentials.
  return startOAuth(oauthConfig(env), provider as ProviderId);
}
