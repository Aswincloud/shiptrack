// Lightweight OAuth 2 / OIDC client. Supports Google, GitHub, and Microsoft.
// Each provider follows the same authorization-code flow:
//   1. /start  -> set a signed state cookie, redirect to provider's authorize URL
//   2. /callback -> verify state cookie, exchange code for token, fetch userinfo
//
// We don't use PKCE for simplicity; the state cookie (httpOnly, short-lived,
// HMAC-signed) is sufficient CSRF protection given our server-side flow.

import type { AppEnv } from "./env";
import { signToken, verifyToken } from "./tokens";

export type ProviderId = "google" | "github" | "microsoft";

export interface ProviderConfig {
  id: ProviderId;
  name: string;
  authorizeUrl: (params: URLSearchParams) => string;
  tokenUrl: (env: AppEnv) => string;
  userinfo: (accessToken: string) => Promise<OAuthUser>;
  scope: string;
  extraAuthParams?: Record<string, string>;
  // Provider's required client_secret style for the token request body.
  tokenRequestStyle: "basic" | "form";
}

export interface OAuthUser {
  providerUserId: string;
  email: string;
  emailVerified: boolean;
}

const STATE_COOKIE_NAME = "shiptrack_oauth_state";
const STATE_TTL_SECONDS = 10 * 60;

function clientFor(provider: ProviderId, env: AppEnv): { id: string; secret: string } | null {
  switch (provider) {
    case "google":
      if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) return null;
      return { id: env.GOOGLE_CLIENT_ID, secret: env.GOOGLE_CLIENT_SECRET };
    case "github":
      if (!env.GITHUB_CLIENT_ID || !env.GITHUB_CLIENT_SECRET) return null;
      return { id: env.GITHUB_CLIENT_ID, secret: env.GITHUB_CLIENT_SECRET };
    case "microsoft":
      if (!env.MICROSOFT_CLIENT_ID || !env.MICROSOFT_CLIENT_SECRET) return null;
      return { id: env.MICROSOFT_CLIENT_ID, secret: env.MICROSOFT_CLIENT_SECRET };
  }
}

export function isProviderConfigured(provider: ProviderId, env: AppEnv): boolean {
  return clientFor(provider, env) !== null;
}

export function configuredProviders(env: AppEnv): ProviderId[] {
  return (["google", "github", "microsoft"] as ProviderId[]).filter((p) =>
    isProviderConfigured(p, env),
  );
}

const providers: Record<ProviderId, Omit<ProviderConfig, "id" | "name">> = {
  google: {
    authorizeUrl: (p) => `https://accounts.google.com/o/oauth2/v2/auth?${p}`,
    tokenUrl: () => "https://oauth2.googleapis.com/token",
    tokenRequestStyle: "form",
    scope: "openid email profile",
    userinfo: async (accessToken) => {
      const r = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!r.ok) throw new Error(`Google userinfo ${r.status}`);
      const j = (await r.json()) as { sub: string; email: string; email_verified?: boolean };
      return {
        providerUserId: j.sub,
        email: j.email,
        emailVerified: j.email_verified !== false,
      };
    },
  },
  github: {
    authorizeUrl: (p) => `https://github.com/login/oauth/authorize?${p}`,
    tokenUrl: () => "https://github.com/login/oauth/access_token",
    tokenRequestStyle: "form",
    scope: "read:user user:email",
    userinfo: async (accessToken) => {
      const headers = {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/vnd.github+json",
        "User-Agent": "shiptrack",
      };
      const ur = await fetch("https://api.github.com/user", { headers });
      if (!ur.ok) throw new Error(`GitHub /user ${ur.status}`);
      const u = (await ur.json()) as { id: number; email: string | null };

      let email = u.email ?? "";
      let verified = false;
      if (!email) {
        const er = await fetch("https://api.github.com/user/emails", { headers });
        if (er.ok) {
          const emails = (await er.json()) as Array<{ email: string; primary: boolean; verified: boolean }>;
          const primary = emails.find((e) => e.primary) ?? emails[0];
          if (primary) {
            email = primary.email;
            verified = primary.verified;
          }
        }
      } else {
        // /user returned an email; assume verified if GitHub surfaced it (only
        // verified primary emails are exposed there).
        verified = true;
      }
      if (!email) throw new Error("GitHub returned no email");
      return { providerUserId: String(u.id), email, emailVerified: verified };
    },
  },
  microsoft: {
    authorizeUrl: (p) => {
      const tenant = "common"; // placeholder; replaced below
      return `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/authorize?${p}`;
    },
    tokenUrl: (env) =>
      `https://login.microsoftonline.com/${env.MICROSOFT_TENANT_ID || "common"}/oauth2/v2.0/token`,
    tokenRequestStyle: "form",
    scope: "openid email profile User.Read",
    userinfo: async (accessToken) => {
      const r = await fetch("https://graph.microsoft.com/v1.0/me", {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!r.ok) throw new Error(`Microsoft Graph /me ${r.status}`);
      const j = (await r.json()) as { id: string; mail?: string; userPrincipalName?: string };
      const email = j.mail ?? j.userPrincipalName ?? "";
      if (!email) throw new Error("Microsoft returned no email");
      return {
        providerUserId: j.id,
        email,
        // Entra-tenant users are always verified by Microsoft.
        emailVerified: true,
      };
    },
  },
};

export function providerName(p: ProviderId): string {
  return p === "google" ? "Google" : p === "github" ? "GitHub" : "Microsoft";
}

export function redirectUri(env: AppEnv, provider: ProviderId): string {
  return `${env.APP_URL.replace(/\/$/, "")}/api/auth/oauth/${provider}/callback`;
}

export function buildAuthorizeUrl(provider: ProviderId, env: AppEnv, state: string): string {
  const client = clientFor(provider, env);
  if (!client) throw new Error("provider not configured");
  const cfg = providers[provider];

  const params = new URLSearchParams({
    client_id: client.id,
    redirect_uri: redirectUri(env, provider),
    state,
    scope: cfg.scope,
    response_type: "code",
  });
  if (provider === "google") {
    params.set("access_type", "online");
    params.set("prompt", "select_account");
  }
  if (provider === "microsoft") {
    params.set("response_mode", "query");
    const tenant = env.MICROSOFT_TENANT_ID || "common";
    return `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/authorize?${params}`;
  }
  return cfg.authorizeUrl(params);
}

export async function exchangeCode(
  provider: ProviderId,
  env: AppEnv,
  code: string,
): Promise<string> {
  const client = clientFor(provider, env);
  if (!client) throw new Error("provider not configured");
  const cfg = providers[provider];

  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri(env, provider),
    client_id: client.id,
    client_secret: client.secret,
  });

  const res = await fetch(cfg.tokenUrl(env), {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`token exchange ${res.status} ${txt.slice(0, 200)}`);
  }
  const json = (await res.json()) as { access_token?: string; error?: string };
  if (!json.access_token) throw new Error(`token exchange: no access_token (${json.error ?? "unknown"})`);
  return json.access_token;
}

export async function fetchOAuthUser(provider: ProviderId, accessToken: string): Promise<OAuthUser> {
  return providers[provider].userinfo(accessToken);
}

// State token: signed nonce. We don't need to round-trip data; just verify the
// browser that returned to /callback is the one we sent to the provider.
export async function createState(secret: string): Promise<string> {
  const nonce = crypto.randomUUID();
  return signToken(secret, nonce, "oauth_state", STATE_TTL_SECONDS);
}

export async function verifyState(secret: string, token: string): Promise<boolean> {
  const r = await verifyToken(secret, token, "oauth_state");
  return r !== null;
}

export function stateCookie(value: string, maxAgeSeconds: number = STATE_TTL_SECONDS): string {
  return [
    `${STATE_COOKIE_NAME}=${value}`,
    "Path=/",
    "HttpOnly",
    "Secure",
    "SameSite=Lax",
    `Max-Age=${maxAgeSeconds}`,
  ].join("; ");
}

export function clearStateCookie(): string {
  return stateCookie("", 0);
}

export const STATE_COOKIE = STATE_COOKIE_NAME;
