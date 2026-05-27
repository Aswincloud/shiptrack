import type { D1Database } from "@cloudflare/workers-types";

export interface WatchRow {
  id: string;
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

export interface NewWatch {
  id: string;
  email: string;
  carrier: string;
  trackingNumber: string;
  label?: string | null;
}

export async function createWatch(db: D1Database, w: NewWatch): Promise<void> {
  const now = Math.floor(Date.now() / 1000);
  await db
    .prepare(
      `INSERT INTO watches (id, email, carrier, tracking_number, label, status, created_at)
       VALUES (?, ?, ?, ?, ?, 'pending', ?)`,
    )
    .bind(w.id, w.email, w.carrier, w.trackingNumber, w.label ?? null, now)
    .run();
}

export async function getWatch(db: D1Database, id: string): Promise<WatchRow | null> {
  const row = await db.prepare(`SELECT * FROM watches WHERE id = ?`).bind(id).first<WatchRow>();
  return row ?? null;
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
