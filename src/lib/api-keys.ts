import type { D1Database } from "@cloudflare/workers-types";

// Per-user API keys (migration 0019). A key looks like
//   st_<prefix:8><secret:32>
// in base62. Only its SHA-256 is stored; the clear key is returned once, from
// createApiKey, and never again. `prefix` is kept so Settings can label keys.

export const API_KEY_PREFIX = "st_";
export const MAX_API_KEYS_PER_USER = 5;
const ALPHABET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
const KEY_RE = /^st_[0-9A-Za-z]{40}$/;
// last_used_at is only rewritten when it is this stale, so a busy script
// doesn't turn every request into a D1 write.
const LAST_USED_RESOLUTION_SECONDS = 300;

export interface ApiKeyRow {
  id: string;
  user_id: string;
  name: string;
  prefix: string;
  key_hash: string;
  created_at: number;
  last_used_at: number | null;
  revoked_at: number | null;
}

export type ApiKeySummary = Pick<ApiKeyRow, "id" | "name" | "prefix" | "created_at" | "last_used_at" | "revoked_at">;

function randomBase62(length: number): string {
  // Rejection sampling: 248 is the largest multiple of 62 below 256, so every
  // character is uniform. Draw extra bytes and refill until there are enough.
  let out = "";
  while (out.length < length) {
    const bytes = crypto.getRandomValues(new Uint8Array(length * 2));
    for (const b of bytes) {
      if (b < 248) out += ALPHABET[b % 62];
      if (out.length === length) break;
    }
  }
  return out;
}

export async function hashApiKey(key: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(key));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

export function looksLikeApiKey(value: string): boolean {
  return KEY_RE.test(value);
}

export async function createApiKey(
  db: D1Database,
  userId: string,
  name: string,
): Promise<{ key: string; summary: ApiKeySummary }> {
  const prefix = randomBase62(8);
  const key = `${API_KEY_PREFIX}${prefix}${randomBase62(32)}`;
  const now = Math.floor(Date.now() / 1000);
  const id = crypto.randomUUID();
  await db
    .prepare(`INSERT INTO api_keys (id, user_id, name, prefix, key_hash, created_at) VALUES (?, ?, ?, ?, ?, ?)`)
    .bind(id, userId, name, prefix, await hashApiKey(key), now)
    .run();
  return { key, summary: { id, name, prefix, created_at: now, last_used_at: null, revoked_at: null } };
}

export async function listApiKeys(db: D1Database, userId: string): Promise<ApiKeySummary[]> {
  const res = await db
    .prepare(
      `SELECT id, name, prefix, created_at, last_used_at, revoked_at FROM api_keys
        WHERE user_id = ? ORDER BY revoked_at IS NOT NULL, created_at DESC`,
    )
    .bind(userId)
    .all<ApiKeySummary>();
  return res.results ?? [];
}

export async function countActiveApiKeys(db: D1Database, userId: string): Promise<number> {
  const row = await db
    .prepare(`SELECT COUNT(*) AS n FROM api_keys WHERE user_id = ? AND revoked_at IS NULL`)
    .bind(userId)
    .first<{ n: number }>();
  return row?.n ?? 0;
}

export async function revokeApiKey(db: D1Database, userId: string, id: string): Promise<boolean> {
  const res = await db
    .prepare(`UPDATE api_keys SET revoked_at = ? WHERE id = ? AND user_id = ? AND revoked_at IS NULL`)
    .bind(Math.floor(Date.now() / 1000), id, userId)
    .run();
  return (res.meta?.changes ?? 0) > 0;
}

export async function revokeAllApiKeys(db: D1Database, userId: string): Promise<void> {
  await db
    .prepare(`UPDATE api_keys SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL`)
    .bind(Math.floor(Date.now() / 1000), userId)
    .run();
}

// The owner of a live key, or null. Looked up by hash, so the clear key never
// reaches the database and a wrong key costs one indexed read.
export async function userIdForApiKey(db: D1Database, key: string): Promise<string | null> {
  if (!looksLikeApiKey(key)) return null;
  // JOIN users: a key whose account no longer exists never authenticates.
  const row = await db
    .prepare(
      `SELECT k.id, k.user_id, k.last_used_at FROM api_keys k JOIN users u ON u.id = k.user_id
        WHERE k.key_hash = ? AND k.revoked_at IS NULL`,
    )
    .bind(await hashApiKey(key))
    .first<{ id: string; user_id: string; last_used_at: number | null }>();
  if (!row) return null;
  const now = Math.floor(Date.now() / 1000);
  if (!row.last_used_at || now - row.last_used_at >= LAST_USED_RESOLUTION_SECONDS) {
    await db.prepare(`UPDATE api_keys SET last_used_at = ? WHERE id = ?`).bind(now, row.id).run();
  }
  return row.user_id;
}
