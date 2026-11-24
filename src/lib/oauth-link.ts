import type { D1Database } from "@cloudflare/workers-types";
import { OAUTH_ONLY_HASH } from "@aswincloud/auth/d1";
import {
  claimUnverifiedForOAuth,
  createUser,
  getUserByEmail,
  getUserById,
  getUserByOAuthIdentity,
  linkOAuthIdentity,
  markEmailVerified,
} from "./db";
import { revokeAllApiKeys } from "./api-keys";

// The provider identity behind a social sign-in, however it arrived (broker
// relay or shiptrack's own OAuth exchange).
export interface OAuthIdentity {
  provider: string;
  providerUserId: string;
  email: string;
  /**
   * Whether the provider verified `email`. Only a verified email may be used
   * to find and link an existing account. An unverified one (a Microsoft login
   * without xms_edov) gets a separate account of its own.
   */
  emailVerified: boolean;
}

export type LinkResult = { ok: true; userId: string } | { ok: false; error: "not_allowed" | "create_failed" };

/**
 * Find or create the local user for a provider identity:
 *   1. a returning identity (provider, providerUserId);
 *   2. else, only for a VERIFIED email, the existing account with that email —
 *      and if that account was never verified, its registration password is
 *      wiped, because the provider has just proved the address is this person's
 *      and whoever registered it may not have been;
 *   3b. else, for an UNVERIFIED email, a brand-new separate account (never
 *      matched by email), under the email if unused or a placeholder if taken;
 *   3. else a brand-new verified account.
 * `allowed(email)` is the site's signup gate; it gates creation only.
 */
export async function findOrCreateOAuthUser(
  db: D1Database,
  id: OAuthIdentity,
  allowed: (email: string) => boolean,
): Promise<LinkResult> {
  const lowerEmail = id.email.toLowerCase();

  // 1. Returning identity.
  const returning = await getUserByOAuthIdentity(db, id.provider, id.providerUserId);
  if (returning) return { ok: true, userId: returning.id };

  // 2. Link by email — only when the provider verified it.
  if (id.emailVerified) {
    const existing = await getUserByEmail(db, lowerEmail);
    if (existing) {
      await linkOAuthIdentity(db, { provider: id.provider, providerUserId: id.providerUserId, userId: existing.id, email: lowerEmail });
      if (existing.email_verified !== 1) {
        await claimUnverifiedForOAuth(db, existing.id, OAUTH_ONLY_HASH);
        await revokeAllApiKeys(db, existing.id);
      }
      return { ok: true, userId: existing.id };
    }
  }

  // 3b. Unverified email: a separate account, never matched to an existing one.
  // It ALWAYS gets a placeholder address, even when the real one is unused:
  // otherwise it would hold that address, and when its real owner later signed
  // in with a verified provider they'd be linked into this account — with the
  // unverified identity (the attacker's) still attached to it.
  if (!id.emailVerified) {
    const email = `${id.provider}-${id.providerUserId}@users.noreply.shiptrack.aswincloud.com`;
    if (!allowed(email)) return { ok: false, error: "not_allowed" };
    const newId = crypto.randomUUID();
    await createUser(db, { id: newId, email, passwordHash: OAUTH_ONLY_HASH }); // email_verified = 0
    await linkOAuthIdentity(db, { provider: id.provider, providerUserId: id.providerUserId, userId: newId, email: lowerEmail });
    const created = await getUserById(db, newId);
    return created ? { ok: true, userId: created.id } : { ok: false, error: "create_failed" };
  }

  // 3. Brand-new verified account.
  if (!allowed(lowerEmail)) return { ok: false, error: "not_allowed" };
  const newId = crypto.randomUUID();
  await createUser(db, { id: newId, email: lowerEmail, passwordHash: OAUTH_ONLY_HASH });
  await markEmailVerified(db, newId);
  await linkOAuthIdentity(db, { provider: id.provider, providerUserId: id.providerUserId, userId: newId, email: lowerEmail });
  const created = await getUserByEmail(db, lowerEmail);
  return created ? { ok: true, userId: created.id } : { ok: false, error: "create_failed" };
}
