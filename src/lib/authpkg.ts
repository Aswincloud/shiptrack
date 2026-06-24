// Bridge between shiptrack's env/email and @aswincloud/auth.
//
// shiptrack consumes the package's framework-agnostic OAuth + /d1 flows. This
// module builds the package's OAuthConfig from our AppEnv and wraps our
// existing Resend `sendEmail` primitive as the package's EmailSender, so auth
// emails keep going out through the same transport (and stay ShipTrack-branded
// via the render* overrides the routes pass in).

import type { OAuthConfig } from "@aswincloud/auth";
import type { EmailSender } from "@aswincloud/auth/d1";
import type { AppEnv } from "./env";
import { sendEmail } from "./email";

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
