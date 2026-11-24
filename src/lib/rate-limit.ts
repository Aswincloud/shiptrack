import type { D1Database } from "@cloudflare/workers-types";
import type { NextRequest } from "next/server";

// Fixed-window rate limiting on D1 (migration 0020). Used on the endpoints an
// attacker would hammer: login, signup, forgot-password, OTP verify/resend and
// inbound WhatsApp VERIFY codes. A limit is (max events, window seconds) per
// key; the key names the limit and its subject, e.g. `login:ip:<ip>`.
//
// It's a soft limit — two requests at the boundary can both pass, which is
// fine here: the aim is to make guessing and inbox-flooding slow, not exact.

export interface Limit {
  max: number;
  windowSec: number;
}

export const LIMITS = {
  loginPerIp: { max: 20, windowSec: 15 * 60 },
  loginPerEmail: { max: 8, windowSec: 15 * 60 },
  sendPerEmail: { max: 3, windowSec: 60 * 60 }, // signup / forgot / resend
  sendPerIp: { max: 15, windowSec: 60 * 60 },
  verifyPerIp: { max: 20, windowSec: 15 * 60 },
  whatsappVerifyPerSender: { max: 10, windowSec: 60 * 60 },
} satisfies Record<string, Limit>;

/** Events for `key` in the current window. */
export async function countEvents(db: D1Database, key: string, windowSec: number): Promise<number> {
  const since = Math.floor(Date.now() / 1000) - windowSec;
  const row = await db
    .prepare(`SELECT COUNT(*) AS n FROM rate_events WHERE key = ? AND created_at >= ?`)
    .bind(key, since)
    .first<{ n: number }>();
  return row?.n ?? 0;
}

export async function recordEvent(db: D1Database, key: string): Promise<void> {
  await db
    .prepare(`INSERT INTO rate_events (key, created_at) VALUES (?, ?)`)
    .bind(key, Math.floor(Date.now() / 1000))
    .run();
}

/** True while `key` is under its limit. Doesn't record anything. */
export async function underLimit(db: D1Database, key: string, limit: Limit): Promise<boolean> {
  return (await countEvents(db, key, limit.windowSec)) < limit.max;
}

/**
 * Record one event for `key` and report whether it was allowed. Use for
 * actions that always count (sending an email). For counting only failures
 * (wrong passwords) use underLimit + recordEvent separately.
 */
export async function take(db: D1Database, key: string, limit: Limit): Promise<boolean> {
  if (!(await underLimit(db, key, limit))) return false;
  await recordEvent(db, key);
  return true;
}

/**
 * The caller's IP as Cloudflare reports it. Only cf-connecting-ip: unlike
 * x-forwarded-for it's set by Cloudflare's edge and can't be forged by the client.
 */
export function clientIp(req: NextRequest | Request): string {
  return req.headers.get("cf-connecting-ip") || "unknown";
}

export const RATE_LIMITED = {
  error: "rate_limited",
  message: "Too many attempts. Please wait a few minutes and try again.",
} as const;
