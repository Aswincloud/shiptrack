import { NextRequest, NextResponse } from "next/server";
import { getEnv } from "@/lib/env";
import { handleOAuthCallback, clearStateCookie, type ProviderId } from "@aswincloud/auth";
import { OAUTH_ONLY_HASH } from "@aswincloud/auth/d1";
import { oauthConfig } from "@/lib/authpkg";
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

function errorRedirect(env: { APP_URL: string }, cfg: ReturnType<typeof oauthConfig>, code: string): NextResponse {
  const url = `${env.APP_URL.replace(/\/$/, "")}/login?oauth_error=${encodeURIComponent(code)}`;
  const res = NextResponse.redirect(url, { status: 303 });
  res.headers.set("Set-Cookie", clearStateCookie(cfg));
  return res;
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ provider: string }> }) {
  const env = getEnv();
  const cfg = oauthConfig(env);
  const { provider: rawProvider } = await ctx.params;
  const provider = rawProvider as ProviderId;

  if (!env.DB || !env.TOKEN_SECRET) return errorRedirect(env, cfg, "not_configured");
  if (!SUPPORTED.includes(provider)) return errorRedirect(env, cfg, "unknown_provider");

  // Package handles CSRF (state cookie == param AND valid signed nonce), code
  // exchange, and userinfo. Returns a stable error code on any failure.
  const result = await handleOAuthCallback(cfg, provider, req);
  if (!result.ok) return errorRedirect(env, cfg, result.error);
  const oauthUser = result.user;

  if (!oauthUser.emailVerified) return errorRedirect(env, cfg, "email_not_verified");
  const lowerEmail = oauthUser.email.toLowerCase();

  // 1. Existing OAuth identity (returning user).
  let user = await getUserByOAuthIdentity(env.DB, provider, oauthUser.providerUserId);

  // 2. Otherwise auto-link by email (password account or another provider).
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

  // 3. Brand-new user: create the row (OAuth-only sentinel hash) + link identity.
  if (!user) {
    const id = crypto.randomUUID();
    await createUser(env.DB, { id, email: lowerEmail, passwordHash: OAUTH_ONLY_HASH });
    await markEmailVerified(env.DB, id);
    await linkOAuthIdentity(env.DB, {
      provider,
      providerUserId: oauthUser.providerUserId,
      userId: id,
      email: lowerEmail,
    });
    user = await getUserByEmail(env.DB, lowerEmail);
    if (!user) return errorRedirect(env, cfg, "create_failed");
  }

  const sessionCookie = await createSessionCookie(env.TOKEN_SECRET, user.id);
  const redirect = `${env.APP_URL.replace(/\/$/, "")}/dashboard`;
  const res = NextResponse.redirect(redirect, { status: 303 });
  res.headers.append("Set-Cookie", clearStateCookie(cfg)); // clear state
  res.headers.append("Set-Cookie", sessionCookie); // set session
  return res;
}
