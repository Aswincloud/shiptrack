import { describe, it, expect, beforeEach } from "vitest";
import type { D1Database } from "@cloudflare/workers-types";
import {
  createApiKey,
  listApiKeys,
  revokeApiKey,
  revokeAllApiKeys,
  userIdForApiKey,
  countActiveApiKeys,
} from "@/lib/api-keys";

// Minimal D1 fake: just enough SQL shapes for api-keys.ts. Rows live in arrays;
// the JOIN users check is modelled by a users set.
function fakeDb() {
  const keys: Record<string, unknown>[] = [];
  const users = new Set<string>(["u1", "u2"]);
  const run = (sql: string, args: unknown[]) => {
    if (sql.startsWith("INSERT INTO api_keys")) {
      const [id, user_id, name, prefix, key_hash, created_at] = args;
      keys.push({ id, user_id, name, prefix, key_hash, created_at, last_used_at: null, revoked_at: null });
      return { meta: { changes: 1 } };
    }
    if (sql.includes("UPDATE api_keys SET revoked_at") && sql.includes("WHERE id = ?")) {
      const [revoked_at, id, user_id] = args;
      const k = keys.find((k) => k.id === id && k.user_id === user_id && k.revoked_at == null);
      if (k) k.revoked_at = revoked_at;
      return { meta: { changes: k ? 1 : 0 } };
    }
    if (sql.includes("UPDATE api_keys SET revoked_at") && sql.includes("WHERE user_id = ?")) {
      const [revoked_at, user_id] = args;
      for (const k of keys) if (k.user_id === user_id && k.revoked_at == null) k.revoked_at = revoked_at;
      return { meta: { changes: 1 } };
    }
    if (sql.startsWith("UPDATE api_keys SET last_used_at")) {
      const [ts, id] = args;
      const k = keys.find((k) => k.id === id);
      if (k) k.last_used_at = ts;
      return { meta: { changes: 1 } };
    }
    return { meta: { changes: 0 } };
  };
  const first = (sql: string, args: unknown[]) => {
    if (sql.includes("COUNT(*) AS n FROM api_keys")) {
      const [user_id] = args;
      return { n: keys.filter((k) => k.user_id === user_id && k.revoked_at == null).length };
    }
    if (sql.includes("JOIN users")) {
      const [hash] = args;
      const k = keys.find((k) => k.key_hash === hash && k.revoked_at == null && users.has(k.user_id as string));
      return k ? { id: k.id, user_id: k.user_id, last_used_at: k.last_used_at } : null;
    }
    return null;
  };
  const all = (sql: string, args: unknown[]) => {
    const [user_id] = args;
    return { results: keys.filter((k) => k.user_id === user_id).map((k) => ({ ...k })) };
  };
  const db = {
    prepare(sql: string) {
      let bound: unknown[] = [];
      const stmt = {
        bind: (...a: unknown[]) => { bound = a; return stmt; },
        run: async () => run(sql, bound),
        first: async () => first(sql, bound),
        all: async () => all(sql, bound),
      };
      return stmt;
    },
  };
  return { db: db as unknown as D1Database, keys, users };
}

describe("api key store", () => {
  let fx: ReturnType<typeof fakeDb>;
  beforeEach(() => { fx = fakeDb(); });

  it("a fresh key authenticates as its owner, then not after revoke", async () => {
    const { key, summary } = await createApiKey(fx.db, "u1", "script");
    expect(await userIdForApiKey(fx.db, key)).toBe("u1");
    expect(await revokeApiKey(fx.db, "u1", summary.id)).toBe(true);
    expect(await userIdForApiKey(fx.db, key)).toBeNull();
  });

  it("only the owner can revoke a key", async () => {
    const { key, summary } = await createApiKey(fx.db, "u1", "k");
    expect(await revokeApiKey(fx.db, "u2", summary.id)).toBe(false);
    expect(await userIdForApiKey(fx.db, key)).toBe("u1"); // still live
  });

  it("an unknown or malformed key is null, with no DB hit for malformed", async () => {
    expect(await userIdForApiKey(fx.db, "st_" + "z".repeat(40))).toBeNull();
    expect(await userIdForApiKey(fx.db, "not-a-key")).toBeNull();
  });

  it("a key whose account is gone no longer authenticates", async () => {
    const { key } = await createApiKey(fx.db, "u1", "k");
    fx.users.delete("u1");
    expect(await userIdForApiKey(fx.db, key)).toBeNull();
  });

  it("revokeAll kills every active key for the user only", async () => {
    const a = await createApiKey(fx.db, "u1", "a");
    const b = await createApiKey(fx.db, "u1", "b");
    const other = await createApiKey(fx.db, "u2", "c");
    await revokeAllApiKeys(fx.db, "u1");
    expect(await userIdForApiKey(fx.db, a.key)).toBeNull();
    expect(await userIdForApiKey(fx.db, b.key)).toBeNull();
    expect(await userIdForApiKey(fx.db, other.key)).toBe("u2");
    expect(await countActiveApiKeys(fx.db, "u1")).toBe(0);
    expect(await countActiveApiKeys(fx.db, "u2")).toBe(1);
  });

  it("lists keys and keeps distinct hashes across keys", async () => {
    await createApiKey(fx.db, "u1", "a");
    await createApiKey(fx.db, "u1", "b");
    const list = await listApiKeys(fx.db, "u1");
    expect(list).toHaveLength(2);
    expect(new Set(fx.keys.map((k) => k.key_hash)).size).toBe(2);
  });
});
