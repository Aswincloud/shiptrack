import { NextRequest, NextResponse } from "next/server";
import { getEnv } from "@/lib/env";
import {
  exchangeCode,
  fetchOAuthUser,
  isProviderConfigured,
  verifyState,
  clearStateCookie,
  STATE_COOKIE,
  type ProviderId,
} from "@/lib/oauth";
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

// Sentinel placed in password_hash for OAuth-only signups. It uses our normal
// pbkdf2$<iter>$<salt>$<hash> shape so verifyPassword still returns false for
// any input, while staying valid to anything that just reads the column.
const OAUTH_ONLY_HASH = "pbkdf2$100000$oauth_only$oauth_only";

function errorRedirect(env: { APP_URL: string }, code: string): NextResponse {
  const url = `${env.APP_URL.replace(/\/$/, "")}/login?oauth_error=${encodeURIComponent(code)}`;
  const res = NextResponse.redirect(url, { status: 303 });
  res.headers.set("Set-Cookie", clearStateCookie());
  return res;
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ provider: string }> }) {
  const env = getEnv();
  const { provider: rawProvider } = await ctx.params;
  const provider = rawProvider as ProviderId;

  if (!env.DB || !env.TOKEN_SECRET) {
    return errorRedirect(env, "not_configured");
  }
  if (!SUPPORTED.includes(provider) || !isProviderConfigured(provider, env)) {
    return errorRedirect(env, "unknown_provider");
  }

  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const stateParam = url.searchParams.get("state");
  const oauthError = url.searchParams.get("error");
  if (oauthError) return errorRedirect(env, oauthError);
  if (!code || !stateParam) return errorRedirect(env, "missing_code");

  // Verify state matches the cookie we set, and the cookie is a valid signed
  // nonce. Both checks together protect against CSRF.
  const stateCookieValue = req.cookies.get(STATE_COOKIE)?.value;
  if (!stateCookieValue || stateCookieValue !== stateParam) {
    return errorRedirect(env, "bad_state");
  }
  const stateOk = await verifyState(env.TOKEN_SECRET, stateParam);
  if (!stateOk) return errorRedirect(env, "bad_state");

  let accessToken: string;
  try {
    accessToken = await exchangeCode(provider, env, code);
  } catch (err) {
    console.warn(`oauth token exchange failed for ${provider}:`, err instanceof Error ? err.message : err);
    return errorRedirect(env, "token_exchange_failed");
  }

  let oauthUser;
  try {
    oauthUser = await fetchOAuthUser(provider, accessToken);
  } catch (err) {
    console.warn(`oauth userinfo failed for ${provider}:`, err instanceof Error ? err.message : err);
    return errorRedirect(env, "userinfo_failed");
  }

  if (!oauthUser.emailVerified) {
    return errorRedirect(env, "email_not_verified");
  }

  const lowerEmail = oauthUser.email.toLowerCase();

  // 1. Try to find an existing OAuth identity (returning user).
  let user = await getUserByOAuthIdentity(env.DB, provider, oauthUser.providerUserId);

  // 2. Otherwise, auto-link by email (existing password account or other OAuth
  //    provider with the same address).
  if (!user) {
    user = await getUserByEmail(env.DB, lowerEmail);
    if (user) {
      await linkOAuthIdentity(env.DB, {
        provider,
        providerUserId: oauthUser.providerUserId,
        userId: user.id,
        email: lowerEmail,
      });
      if (user.email_verified !== 1) await markEmailVerified(env.DB, user.id);
    }
  }

  // 3. Brand-new user: create the row and link the identity.
  if (!user) {
    const id = crypto.randomUUID();
    await createUser(env.DB, {
      id,
      email: lowerEmail,
      passwordHash: OAUTH_ONLY_HASH,
    });
    await markEmailVerified(env.DB, id);
    await linkOAuthIdentity(env.DB, {
      provider,
      providerUserId: oauthUser.providerUserId,
      userId: id,
      email: lowerEmail,
    });
    user = await getUserByEmail(env.DB, lowerEmail);
    if (!user) {
      // Should never happen, but bail loudly if it does.
      return errorRedirect(env, "create_failed");
    }
  }

  const sessionCookie = await createSessionCookie(env.TOKEN_SECRET, user.id);
  const redirect = `${env.APP_URL.replace(/\/$/, "")}/dashboard`;
  const res = NextResponse.redirect(redirect, { status: 303 });
  // Two Set-Cookie headers: clear state cookie + set session cookie.
  res.headers.append("Set-Cookie", clearStateCookie());
  res.headers.append("Set-Cookie", sessionCookie);
  return res;
}

