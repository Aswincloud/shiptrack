// Bridge between shiptrack's env/email and @aswincloud/auth.
//
// shiptrack consumes the package's framework-agnostic OAuth + /d1 flows. This
// module builds the package's OAuthConfig from our AppEnv and wraps our
// existing Resend `sendEmail` primitive as the package's EmailSender, so auth
// emails keep going out through the same transport (and stay ShipTrack-branded
// via the render* overrides the routes pass in).

import type { OAuthConfig, ProviderId, RelayClaims } from "@aswincloud/auth";
import {
  emailAllowed,
  parseAccessMode,
  signToken,
  verifyToken,
  verifyRelay,
  serializeCookie,
  readCookie,
  randomSecret,
} from "@aswincloud/auth";
import type { EmailSender } from "@aswincloud/auth/d1";
import type { AppEnv } from "./env";
import { sendEmail } from "./email";

/**
 * Apply this site's access policy to a candidate email (signup / first OAuth
 * login). Gates *account creation* only — existing users are never re-gated.
 *
 * Unlike the package default (which fails closed to "owners"), shiptrack fails
 * OPEN to "public" when ACCESS_MODE is unset, preserving its historical
 * open-signup behavior. Set ACCESS_MODE=domain (+ACCESS_DOMAINS) or
 * ACCESS_MODE=owners (+OWNER_EMAILS) to restrict.
 */
export function emailAllowedForSite(env: AppEnv, email: string): boolean {
  const raw = (env.ACCESS_MODE ?? "").trim();
  if (!raw) return !!email; // default: public — any non-empty email
  return emailAllowed({
    mode: parseAccessMode(raw),
    email,
    owners: env.OWNER_EMAILS,
    domains: env.ACCESS_DOMAINS,
  });
}

// Cookie names kept identical to the pre-migration values so any in-flight
// OAuth round-trip and every existing session survive the swap untouched.
export const SESSION_COOKIE_NAME = "shiptrack_session";
export const OAUTH_STATE_COOKIE_NAME = "shiptrack_oauth_state";

/** Build the package OAuthConfig from our env. Providers without creds are simply omitted. */
export function oauthConfig(env: AppEnv): OAuthConfig {
  const appUrl = env.APP_URL.replace(/\/$/, "");
  return {
    clients: {
      ...(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET
        ? { google: { clientId: env.GOOGLE_CLIENT_ID, clientSecret: env.GOOGLE_CLIENT_SECRET } }
        : {}),
      ...(env.GITHUB_CLIENT_ID && env.GITHUB_CLIENT_SECRET
        ? { github: { clientId: env.GITHUB_CLIENT_ID, clientSecret: env.GITHUB_CLIENT_SECRET } }
        : {}),
      ...(env.MICROSOFT_CLIENT_ID && env.MICROSOFT_CLIENT_SECRET
        ? {
            microsoft: {
              clientId: env.MICROSOFT_CLIENT_ID,
              clientSecret: env.MICROSOFT_CLIENT_SECRET,
              tenantId: env.MICROSOFT_TENANT_ID,
            },
          }
        : {}),
    },
    stateSecret: env.TOKEN_SECRET,
    stateCookieName: OAUTH_STATE_COOKIE_NAME,
    redirectUri: (p) => `${appUrl}/api/auth/oauth/${p}/callback`,
  };
}

/**
 * Adapt our Resend `sendEmail` into the package's EmailSender. Returns null when
 * Resend isn't configured so callers can decide whether that's fatal (signup)
 * or swallowable (anti-enumeration forgot-password).
 */
export function makeSendEmail(env: AppEnv): EmailSender | null {
  if (!env.RESEND_API_KEY || !env.RESEND_FROM) return null;
  const mail = { RESEND_API_KEY: env.RESEND_API_KEY, RESEND_FROM: env.RESEND_FROM, APP_URL: env.APP_URL };
  return (args) => sendEmail(mail, args);
}

// ---- central OAuth broker (auth.aswincloud.com) ----
//
// When AUTH_BROKER_URL + RELAY_SECRET are set, OAuth sign-in is relayed through
// the broker (one OAuth client per provider, shared across sites) instead of
// shiptrack's own per-provider clients. The broker authenticates the user and
// relays {email, provider, providerUserId, nonce} signed with our RELAY_SECRET;
// we verify it, match the nonce we issued, and run the SAME account-linking flow
// as before (on the provider's stable user id).

export const SITE_ID = "shiptrack"; // how this site is registered with the broker
const NONCE_COOKIE = "shiptrack_oauth_nonce";
const NONCE_PURPOSE = "broker_nonce";
const NONCE_TTL_SECONDS = 10 * 60;

/** True when sign-in should go through the broker (vs shiptrack's own clients). */
export function brokerConfigured(env: AppEnv): boolean {
  return !!(env.AUTH_BROKER_URL && env.RELAY_SECRET && env.TOKEN_SECRET);
}

/**
 * Build the broker `/start` redirect for a provider, plus a signed, short-lived
 * nonce cookie binding this login attempt to the relay we'll get back. Returns
 * the absolute start URL and the Set-Cookie header value.
 */
export async function brokerStart(
  env: AppEnv,
  provider: ProviderId,
): Promise<{ location: string; setCookie: string }> {
  const nonce = randomSecret(16);
  const nonceTok = await signToken(env.TOKEN_SECRET, nonce, NONCE_PURPOSE, NONCE_TTL_SECONDS);
  const appUrl = env.APP_URL.replace(/\/$/, "");
  const base = env.AUTH_BROKER_URL!.replace(/\/$/, "");
  const start = new URL(`${base}/api/oauth/${provider}/start`);
  start.searchParams.set("site", SITE_ID);
  start.searchParams.set("return", `${appUrl}/api/auth/oauth/${provider}/callback`);
  start.searchParams.set("nonce", nonce);
  return {
    location: start.toString(),
    setCookie: serializeCookie(NONCE_COOKIE, nonceTok, { maxAgeSeconds: NONCE_TTL_SECONDS }),
  };
}

/** Clear the broker nonce cookie (used on callback completion/failure). */
export function clearBrokerNonceCookie(): string {
  return serializeCookie(NONCE_COOKIE, "", { maxAgeSeconds: 0 });
}

/**
 * Verify a broker relay token from the callback: signature (our RELAY_SECRET),
 * provider match, and that its nonce matches the one we issued (replay defense).
 * Returns the verified claims or null.
 */
export async function verifyBrokerRelay(
  env: AppEnv,
  req: Request,
  provider: ProviderId,
  relayToken: string,
): Promise<RelayClaims | null> {
  const claims = await verifyRelay(env.RELAY_SECRET ?? "", relayToken);
  if (!claims || claims.provider !== provider) return null;
  const nonceTok = readCookie(req, NONCE_COOKIE);
  const expected = nonceTok ? await verifyToken(env.TOKEN_SECRET, nonceTok, NONCE_PURPOSE) : null;
  if (!expected || expected !== claims.nonce) return null;
  return claims;
}
