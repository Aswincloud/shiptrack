import type { D1Database } from "@cloudflare/workers-types";

// In-memory D1 for unit tests. Matches on stable substrings of the SQL the
// code under test issues (users, oauth_identities, api_keys, rate_events) —
// not a SQL engine. An unhandled statement throws, so a test can't pass by
// silently skipping a query.
export interface FakeUser {
  id: string;
  email: string;
  password_hash: string;
  email_verified: number;
  is_admin: number;
  created_at: number;
}

export function makeFakeDb() {
  const users = new Map<string, FakeUser>();
  const oauth = new Map<string, { user_id: string; email: string }>();
  const keys: { user_id: string; revoked_at: number | null }[] = [];
  const events: { key: string; created_at: number }[] = [];
  const byEmail = (e: string) => [...users.values()].find((u) => u.email.toLowerCase() === String(e).toLowerCase()) ?? null;

  function exec(sql: string, a: unknown[]): { first?: unknown; all?: unknown[]; changes?: number } {
    const q = sql.replace(/\s+/g, " ").trim();
    if (q.startsWith("INSERT INTO users")) {
      const [id, email, password_hash, created_at] = a as [string, string, string, number];
      if (byEmail(email)) throw new Error("UNIQUE constraint failed: users.email");
      users.set(id, { id, email, password_hash, email_verified: 0, is_admin: 0, created_at });
      return {};
    }
    if (q.startsWith("SELECT * FROM users WHERE id")) return { first: users.get(a[0] as string) ?? null };
    if (q.startsWith("SELECT * FROM users WHERE email")) return { first: byEmail(a[0] as string) };
    if (q.startsWith("UPDATE users SET email_verified = 1, password_hash = ?")) {
      const u = users.get(a[1] as string);
      if (u && u.email_verified !== 1) { u.email_verified = 1; u.password_hash = a[0] as string; return { changes: 1 }; }
      return { changes: 0 };
    }
    if (q.startsWith("UPDATE users SET email_verified = 1")) { const u = users.get(a[0] as string); if (u) u.email_verified = 1; return {}; }
    if (q.includes("FROM users u") && q.includes("oauth_identities")) {
      const hit = oauth.get(`${a[0]}:${a[1]}`);
      return { first: hit ? users.get(hit.user_id) ?? null : null };
    }
    if (q.startsWith("INSERT INTO oauth_identities")) {
      const [provider, puid, user_id, email] = a as string[];
      oauth.set(`${provider}:${puid}`, { user_id, email });
      return {};
    }
    if (q.startsWith("UPDATE api_keys SET revoked_at = ? WHERE user_id = ?")) {
      for (const k of keys) if (k.user_id === a[1] && k.revoked_at === null) k.revoked_at = a[0] as number;
      return {};
    }
    if (q.startsWith("SELECT COUNT(*) AS n FROM rate_events")) {
      return { first: { n: events.filter((e) => e.key === a[0] && e.created_at >= (a[1] as number)).length } };
    }
    if (q.startsWith("INSERT INTO rate_events (key, created_at) SELECT")) {
      const [key, now, , since, max] = a as [string, number, string, number, number];
      const n = events.filter((e) => e.key === key && e.created_at >= since).length;
      if (n < max) { events.push({ key, created_at: now }); return { changes: 1 }; }
      return { changes: 0 };
    }
    if (q.startsWith("INSERT INTO rate_events")) { events.push({ key: a[0] as string, created_at: a[1] as number }); return {}; }
    throw new Error(`fake-d1: unhandled SQL: ${q}`);
  }

  const db = {
    prepare(sql: string) {
      let bound: unknown[] = [];
      const stmt = {
        bind: (...a: unknown[]) => { bound = a; return stmt; },
        first: async () => exec(sql, bound).first ?? null,
        all: async () => ({ results: exec(sql, bound).all ?? [] }),
        run: async () => { const r = exec(sql, bound); return { success: true, meta: { changes: r.changes ?? 1 } }; },
      };
      return stmt;
    },
  } as unknown as D1Database;
  return { db, users, oauth, keys, events };
}
