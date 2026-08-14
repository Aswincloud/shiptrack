import { NextRequest, NextResponse } from "next/server";
import { getEnv, type AppEnv } from "@/lib/env";
import { handleOAuthCallback, clearStateCookie, type ProviderId } from "@aswincloud/auth";
import { OAUTH_ONLY_HASH } from "@aswincloud/auth/d1";
import {
  oauthConfig,
  emailAllowedForSite,
  brokerConfigured,
  verifyBrokerRelay,
  clearBrokerNonceCookie,
} from "@/lib/authpkg";
import {
  createUser,
  getUserByEmail,
  getUserByOAuthIdentity,
  linkOAuthIdentity,
  markEmailVerified,
} from "@/lib/db";
import { createSessionCookie } from "@/lib/auth";

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

// The verified provider identity, however it was obtained (broker relay or local
// OAuth). Account-linking below is identical for both.
interface VerifiedIdentity {
  provider: ProviderId;
  providerUserId: string;
  email: string;
}

// Steps 1–3: find or create the local user for a verified provider identity, then
// set the session. Shared by the broker and legacy paths so linking semantics —
// match on (provider, providerUserId), else by email, else create (access-gated)
// — stay identical. `clearCookies` are appended to every response.
async function loginWithIdentity(
  env: AppEnv,
  id: VerifiedIdentity,
  clearCookies: string[],
): Promise<NextResponse> {
  const lowerEmail = id.email.toLowerCase();

  // 1. Existing OAuth identity (returning user).
  let user = await getUserByOAuthIdentity(env.DB, id.provider, id.providerUserId);

  // 2. Otherwise auto-link by email (password account or another provider).
  if (!user) {
    user = await getUserByEmail(env.DB, lowerEmail);
    if (user) {
      await linkOAuthIdentity(env.DB, {
        provider: id.provider,
        providerUserId: id.providerUserId,
        userId: user.id,
        email: lowerEmail,
      });
      if (user.email_verified !== 1) await markEmailVerified(env.DB, user.id);
    }
  }

  // 3. Brand-new user: create the row (OAuth-only sentinel hash) + link identity.
  if (!user) {
    // Access policy gates account *creation* only — returning users (steps 1-2)
    // are never re-gated. Default mode is "public" (open) unless ACCESS_MODE set.
    if (!emailAllowedForSite(env, lowerEmail)) return errorRedirect(env, "not_allowed", clearCookies);
    const newId = crypto.randomUUID();
    await createUser(env.DB, { id: newId, email: lowerEmail, passwordHash: OAUTH_ONLY_HASH });
    await markEmailVerified(env.DB, newId);
    await linkOAuthIdentity(env.DB, {
      provider: id.provider,
      providerUserId: id.providerUserId,
      userId: newId,
      email: lowerEmail,
    });
    user = await getUserByEmail(env.DB, lowerEmail);
    if (!user) return errorRedirect(env, "create_failed", clearCookies);
  }

  const sessionCookie = await createSessionCookie(env.TOKEN_SECRET, user.id);
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
    // The broker only relays verified emails, so emailVerified is implicit here.
    return loginWithIdentity(
      env,
      { provider, providerUserId: claims.providerUserId, email: claims.email },
      clear,
    );
  }

  // --- Legacy path: shiptrack's own OAuth client did the exchange. ---
  const cfg = oauthConfig(env);
  const clear = [clearStateCookie(cfg)];
  const result = await handleOAuthCallback(cfg, provider, req);
  if (!result.ok) return errorRedirect(env, result.error, clear);
  if (!result.user.emailVerified) return errorRedirect(env, "email_not_verified", clear);
  return loginWithIdentity(
    env,
    { provider, providerUserId: result.user.providerUserId, email: result.user.email },
    clear,
  );
}
