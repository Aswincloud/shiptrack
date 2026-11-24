import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { makeFakeDb } from "./fake-d1";

// readSession looks the user up through getEnvAsync(); point it at the fake DB.
const fx = makeFakeDb();
vi.mock("@/lib/env", () => ({ getEnvAsync: async () => ({ DB: fx.db }), getEnv: () => ({ DB: fx.db }) }));
const { createSessionCookie, readSession } = await import("@/lib/auth");
const { signToken } = await import("@aswincloud/auth");

const SECRET = "test-secret";
const reqWith = (cookieHeader: string) => {
  const token = cookieHeader.split(";")[0].split("=").slice(1).join("=");
  return new NextRequest("https://shiptrack.example/", { headers: { cookie: `shiptrack_session=${token}` } });
};

describe("sessions are bound to the password (security stamp)", () => {
  beforeEach(() => {
    fx.users.clear();
    fx.users.set("u1", { id: "u1", email: "a@b.com", password_hash: "pbkdf2$100000$x$old", email_verified: 1, is_admin: 0, created_at: 1 });
  });

  it("a fresh session is accepted", async () => {
    const cookie = await createSessionCookie(SECRET, "u1", fx.db);
    expect(await readSession(SECRET, reqWith(cookie))).toEqual({ userId: "u1" });
  });

  it("changing the password signs out existing sessions (incl. a stolen one)", async () => {
    const cookie = await createSessionCookie(SECRET, "u1", fx.db);
    fx.users.get("u1")!.password_hash = "pbkdf2$100000$x$new";
    expect(await readSession(SECRET, reqWith(cookie))).toBeNull();
  });

  it("a deleted account's session is rejected", async () => {
    const cookie = await createSessionCookie(SECRET, "u1", fx.db);
    fx.users.delete("u1");
    expect(await readSession(SECRET, reqWith(cookie))).toBeNull();
  });

  it("an old-format session (bare userId, no stamp) is rejected → one-time re-login", async () => {
    const legacy = await signToken(SECRET, "u1", "session", 3600);
    expect(await readSession(SECRET, reqWith(`shiptrack_session=${legacy}`))).toBeNull();
  });

  it("a forged stamp is rejected", async () => {
    const forged = await signToken("wrong-secret", "u1.0000000000000000", "session", 3600);
    expect(await readSession(SECRET, reqWith(`shiptrack_session=${forged}`))).toBeNull();
  });
});
