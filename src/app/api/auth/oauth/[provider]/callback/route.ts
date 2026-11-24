import { NextRequest, NextResponse } from "next/server";
import { getEnv, type AppEnv } from "@/lib/env";
import { handleOAuthCallback, clearStateCookie, type ProviderId } from "@aswincloud/auth";
import {
  oauthConfig,
  emailAllowedForSite,
  brokerConfigured,
  verifyBrokerRelay,
  clearBrokerNonceCookie,
} from "@/lib/authpkg";
import { createSessionCookie } from "@/lib/auth";
import { findOrCreateOAuthUser, type OAuthIdentity } from "@/lib/oauth-link";

export const dynamic = "force-dynamic";

const SUPPORTED: ProviderId[] = ["google", "github", "microsoft"];

// One redirect helper for both paths. `extraCookies` lets each path clear its own
// transient cookie (the package state cookie, or the broker nonce cookie).
function errorRedirect(env: { APP_URL: string }, code: string, extraCookies: string[]): NextResponse {
  const url = `${env.APP_URL.replace(/\/$/, "")}/login?oauth_error=${encodeURIComponent(code)}`;
  const res = NextResponse.redirect(url, { status: 303 });
  for (const c of extraCookies) res.headers.append("Set-Cookie", c);
  return res;
}

// Find or create the local user (src/lib/oauth-link.ts), then set the session.
// Shared by the broker and legacy paths so linking is identical for both.
async function loginWithIdentity(
  env: AppEnv,
  id: OAuthIdentity,
  clearCookies: string[],
): Promise<NextResponse> {
  const r = await findOrCreateOAuthUser(env.DB, id, (email) => emailAllowedForSite(env, email));
  if (!r.ok) return errorRedirect(env, r.error, clearCookies);
  const sessionCookie = await createSessionCookie(env.TOKEN_SECRET, r.userId, env.DB);
  const redirect = `${env.APP_URL.replace(/\/$/, "")}/dashboard`;
  const res = NextResponse.redirect(redirect, { status: 303 });
  for (const c of clearCookies) res.headers.append("Set-Cookie", c);
  res.headers.append("Set-Cookie", sessionCookie);
  return res;
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ provider: string }> }) {
  const env = getEnv();
  const { provider: rawProvider } = await ctx.params;
  const provider = rawProvider as ProviderId;

  if (!env.DB || !env.TOKEN_SECRET) return errorRedirect(env, "not_configured", []);
  if (!SUPPORTED.includes(provider)) return errorRedirect(env, "unknown_provider", []);

  // --- Broker path: the central broker relayed a verified identity to us. ---
  if (brokerConfigured(env)) {
    const clear = [clearBrokerNonceCookie()];
    const url = new URL(req.url);
    const relayError = url.searchParams.get("relay_error");
    if (relayError) return errorRedirect(env, relayError, clear);
    const relay = url.searchParams.get("relay");
    if (!relay) return errorRedirect(env, "bad_state", clear);

    const claims = await verifyBrokerRelay(env, req, provider, relay);
    if (!claims) return errorRedirect(env, "bad_state", clear);
    if (!claims.providerUserId) return errorRedirect(env, "no_provider_id", clear);
    // A relay is verified unless the broker marked it otherwise (it only does
    // so for unverified Microsoft logins, to sites that opted in).
    return loginWithIdentity(
      env,
      { provider, providerUserId: claims.providerUserId, email: claims.email, emailVerified: claims.emailVerified !== false },
      clear,
    );
  }

  // --- Legacy path: shiptrack's own OAuth client did the exchange. ---
  const cfg = oauthConfig(env);
  const clear = [clearStateCookie(cfg)];
  // Microsoft logins without a verified email are let through as a separate
  // account (step 3b); every other provider must verify.
  const result = await handleOAuthCallback({ ...cfg, requireVerifiedEmail: provider !== "microsoft" }, provider, req);
  if (!result.ok) return errorRedirect(env, result.error, clear);
  return loginWithIdentity(
    env,
    { provider, providerUserId: result.user.providerUserId, email: result.user.email, emailVerified: result.user.emailVerified },
    clear,
  );
}
