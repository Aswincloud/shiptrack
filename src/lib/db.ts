import type { D1Database } from "@cloudflare/workers-types";

export interface WatchRow {
  id: string;
  user_id: string | null;
  email: string;
  carrier: string;
  tracking_number: string;
  label: string | null;
  status: "pending" | "active" | "cancelled";
  last_known_status: string | null;
  last_event_hash: string | null;
  last_polled_at: number | null;
  created_at: number;
  confirmed_at: number | null;
}

export interface UserRow {
  id: string;
  email: string;
  password_hash: string;
  email_verified: number;
  resend_api_key: string | null;
  created_at: number;
  is_admin: number;
}

export interface AdminUserView {
  id: string;
  email: string;
  email_verified: number;
  is_admin: number;
  created_at: number;
  watch_count: number;
}

export interface OtpRow {
  email: string;
  code_hash: string;
  expires_at: number;
  attempts: number;
  created_at: number;
}

export interface NewWatch {
  id: string;
  email: string;
  carrier: string;
  trackingNumber: string;
  label?: string | null;
  userId?: string | null;
}

export async function createWatch(db: D1Database, w: NewWatch): Promise<void> {
  const now = Math.floor(Date.now() / 1000);
  await db
    .prepare(
      `INSERT INTO watches (id, user_id, email, carrier, tracking_number, label, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, 'pending', ?)`,
    )
    .bind(w.id, w.userId ?? null, w.email, w.carrier, w.trackingNumber, w.label ?? null, now)
    .run();
}

export async function getWatch(db: D1Database, id: string): Promise<WatchRow | null> {
  const row = await db.prepare(`SELECT * FROM watches WHERE id = ?`).bind(id).first<WatchRow>();
  return row ?? null;
}

export async function getWatchForUser(
  db: D1Database,
  id: string,
  userId: string,
): Promise<WatchRow | null> {
  const row = await db
    .prepare(`SELECT * FROM watches WHERE id = ? AND user_id = ?`)
    .bind(id, userId)
    .first<WatchRow>();
  return row ?? null;
}

export async function listWatchesByUser(db: D1Database, userId: string): Promise<WatchRow[]> {
  const res = await db
    .prepare(`SELECT * FROM watches WHERE user_id = ? ORDER BY created_at DESC`)
    .bind(userId)
    .all<WatchRow>();
  return res.results ?? [];
}

export async function confirmWatch(db: D1Database, id: string): Promise<boolean> {
  const now = Math.floor(Date.now() / 1000);
  const res = await db
    .prepare(`UPDATE watches SET status='active', confirmed_at=? WHERE id=? AND status='pending'`)
    .bind(now, id)
    .run();
  return (res.meta?.changes ?? 0) > 0;
}

export async function cancelWatch(db: D1Database, id: string): Promise<boolean> {
  const res = await db
    .prepare(`UPDATE watches SET status='cancelled' WHERE id=? AND status != 'cancelled'`)
    .bind(id)
    .run();
  return (res.meta?.changes ?? 0) > 0;
}

export async function cancelWatchForUser(
  db: D1Database,
  id: string,
  userId: string,
): Promise<boolean> {
  const res = await db
    .prepare(`UPDATE watches SET status='cancelled' WHERE id=? AND user_id=? AND status != 'cancelled'`)
    .bind(id, userId)
    .run();
  return (res.meta?.changes ?? 0) > 0;
}

export async function updateWatchForUser(
  db: D1Database,
  id: string,
  userId: string,
  patch: { label?: string | null; email?: string },
): Promise<boolean> {
  const fields: string[] = [];
  const values: (string | null)[] = [];
  if (patch.label !== undefined) {
    fields.push("label = ?");
    values.push(patch.label);
  }
  if (patch.email !== undefined) {
    fields.push("email = ?");
    values.push(patch.email);
  }
  if (fields.length === 0) return false;
  values.push(id, userId);
  const res = await db
    .prepare(`UPDATE watches SET ${fields.join(", ")} WHERE id = ? AND user_id = ?`)
    .bind(...values)
    .run();
  return (res.meta?.changes ?? 0) > 0;
}

export async function listDueWatches(
  db: D1Database,
  now: number,
  intervalSeconds: number,
  batchSize: number,
): Promise<WatchRow[]> {
  const cutoff = now - intervalSeconds;
  const res = await db
    .prepare(
      `SELECT * FROM watches
       WHERE status='active' AND (last_polled_at IS NULL OR last_polled_at < ?)
       ORDER BY last_polled_at ASC NULLS FIRST
       LIMIT ?`,
    )
    .bind(cutoff, batchSize)
    .all<WatchRow>();
  return res.results ?? [];
}

export async function markPolled(
  db: D1Database,
  id: string,
  updates: {
    lastKnownStatus?: string;
    lastEventHash?: string;
    terminate?: boolean;
  } = {},
): Promise<void> {
  const now = Math.floor(Date.now() / 1000);
  const fields: string[] = ["last_polled_at = ?"];
  const values: (string | number | null)[] = [now];
  if (updates.lastKnownStatus !== undefined) {
    fields.push("last_known_status = ?");
    values.push(updates.lastKnownStatus);
  }
  if (updates.lastEventHash !== undefined) {
    fields.push("last_event_hash = ?");
    values.push(updates.lastEventHash);
  }
  if (updates.terminate) {
    fields.push("status = 'cancelled'");
  }
  values.push(id);
  await db
    .prepare(`UPDATE watches SET ${fields.join(", ")} WHERE id = ?`)
    .bind(...values)
    .run();
}

export async function recordEvent(
  db: D1Database,
  watchId: string,
  ev: { status: string; description?: string; location?: string; timestamp?: string },
): Promise<void> {
  const now = Math.floor(Date.now() / 1000);
  await db
    .prepare(
      `INSERT INTO events (watch_id, status, description, location, timestamp, recorded_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .bind(watchId, ev.status, ev.description ?? null, ev.location ?? null, ev.timestamp ?? null, now)
    .run();
}

// --- Users ---

export async function createUser(
  db: D1Database,
  u: { id: string; email: string; passwordHash: string },
): Promise<void> {
  const now = Math.floor(Date.now() / 1000);
  await db
    .prepare(
      `INSERT INTO users (id, email, password_hash, email_verified, created_at)
       VALUES (?, ?, ?, 0, ?)`,
    )
    .bind(u.id, u.email, u.passwordHash, now)
    .run();
}

export async function getUserByEmail(db: D1Database, email: string): Promise<UserRow | null> {
  const row = await db
    .prepare(`SELECT * FROM users WHERE email = ?`)
    .bind(email)
    .first<UserRow>();
  return row ?? null;
}

export async function getUserById(db: D1Database, id: string): Promise<UserRow | null> {
  const row = await db.prepare(`SELECT * FROM users WHERE id = ?`).bind(id).first<UserRow>();
  return row ?? null;
}

export async function markEmailVerified(db: D1Database, userId: string): Promise<void> {
  await db.prepare(`UPDATE users SET email_verified = 1 WHERE id = ?`).bind(userId).run();
}

export async function updateUserPasswordHash(
  db: D1Database,
  userId: string,
  passwordHash: string,
): Promise<void> {
  await db
    .prepare(`UPDATE users SET password_hash = ? WHERE id = ?`)
    .bind(passwordHash, userId)
    .run();
}

export async function updateUserResendKey(
  db: D1Database,
  userId: string,
  key: string | null,
): Promise<void> {
  await db
    .prepare(`UPDATE users SET resend_api_key = ? WHERE id = ?`)
    .bind(key, userId)
    .run();
}

export async function updateUserEmail(
  db: D1Database,
  userId: string,
  newEmail: string,
): Promise<{ ok: boolean; conflict?: boolean }> {
  // Check for an existing user with this email first to give a friendly error
  // instead of a raw UNIQUE constraint failure.
  const existing = await db
    .prepare(`SELECT id FROM users WHERE email = ? AND id != ?`)
    .bind(newEmail, userId)
    .first<{ id: string }>();
  if (existing) return { ok: false, conflict: true };
  await db.prepare(`UPDATE users SET email = ? WHERE id = ?`).bind(newEmail, userId).run();
  return { ok: true };
}

export async function deleteUser(db: D1Database, userId: string): Promise<void> {
  // Watches cascade via the user_id FK; events cascade off watches.
  await db.prepare(`DELETE FROM users WHERE id = ?`).bind(userId).run();
}

export async function listAdminEmails(db: D1Database): Promise<string[]> {
  const res = await db
    .prepare(`SELECT email FROM users WHERE is_admin = 1 AND email_verified = 1`)
    .all<{ email: string }>();
  return (res.results ?? []).map((r) => r.email);
}

export async function countAdmins(db: D1Database): Promise<number> {
  const row = await db
    .prepare(`SELECT COUNT(*) AS n FROM users WHERE is_admin = 1`)
    .first<{ n: number }>();
  return row?.n ?? 0;
}

export async function listAllUsersForAdmin(db: D1Database): Promise<AdminUserView[]> {
  const res = await db
    .prepare(
      `SELECT u.id, u.email, u.email_verified, u.is_admin, u.created_at,
              COALESCE(COUNT(w.id), 0) AS watch_count
       FROM users u
       LEFT JOIN watches w ON w.user_id = u.id AND w.status != 'cancelled'
       GROUP BY u.id
       ORDER BY u.created_at DESC`,
    )
    .all<AdminUserView>();
  return res.results ?? [];
}

// --- OTP ---

export async function upsertOtp(
  db: D1Database,
  email: string,
  codeHash: string,
  expiresAt: number,
): Promise<void> {
  const now = Math.floor(Date.now() / 1000);
  await db
    .prepare(
      `INSERT INTO otp_codes (email, code_hash, expires_at, attempts, created_at)
       VALUES (?, ?, ?, 0, ?)
       ON CONFLICT(email) DO UPDATE SET
         code_hash = excluded.code_hash,
         expires_at = excluded.expires_at,
         attempts = 0,
         created_at = excluded.created_at`,
    )
    .bind(email, codeHash, expiresAt, now)
    .run();
}

export async function getOtp(db: D1Database, email: string): Promise<OtpRow | null> {
  const row = await db
    .prepare(`SELECT * FROM otp_codes WHERE email = ?`)
    .bind(email)
    .first<OtpRow>();
  return row ?? null;
}

export async function incrementOtpAttempts(db: D1Database, email: string): Promise<void> {
  await db
    .prepare(`UPDATE otp_codes SET attempts = attempts + 1 WHERE email = ?`)
    .bind(email)
    .run();
}

export async function deleteOtp(db: D1Database, email: string): Promise<void> {
  await db.prepare(`DELETE FROM otp_codes WHERE email = ?`).bind(email).run();
}
