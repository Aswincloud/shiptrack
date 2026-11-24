import { describe, it, expect, beforeEach } from "vitest";
import { OAUTH_ONLY_HASH } from "@aswincloud/auth/d1";
import { findOrCreateOAuthUser } from "@/lib/oauth-link";
import { take, underLimit, recordEvent, clientIp } from "@/lib/rate-limit";
import { validTrackingNumber, normaliseTrackingNumber } from "@/carriers/validate";
import { confirmSubject, parseConfirmSubject } from "@/lib/watch-confirm";
import { maskPhone } from "@/lib/whatsapp";
import { makeFakeDb } from "./fake-d1";

const allowAll = () => true;
const ms = (over: Partial<{ email: string; providerUserId: string; emailVerified: boolean }> = {}) => ({
  provider: "microsoft",
  providerUserId: over.providerUserId ?? "ms-1",
  email: over.email ?? "victim@example.com",
  emailVerified: over.emailVerified ?? false,
});

describe("OAuth linking (account-takeover fixes)", () => {
  let fx: ReturnType<typeof makeFakeDb>;
  beforeEach(() => {
    fx = makeFakeDb();
    fx.users.set("victim", { id: "victim", email: "victim@example.com", password_hash: "pbkdf2$real", email_verified: 1, is_admin: 1, created_at: 1 });
  });

  it("an UNVERIFIED Microsoft email never signs in to the existing account (nOAuth)", async () => {
    const r = await findOrCreateOAuthUser(fx.db, ms(), allowAll);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.userId).not.toBe("victim");
    expect(fx.users.get("victim")!.password_hash).toBe("pbkdf2$real"); // untouched
  });

  it("…it gets a separate account under a placeholder when the email is taken", async () => {
    const r = await findOrCreateOAuthUser(fx.db, ms(), allowAll);
    if (!r.ok) throw new Error("expected ok");
    const u = fx.users.get(r.userId)!;
    expect(u.email).toBe("microsoft-ms-1@users.noreply.shiptrack.aswincloud.com");
    expect(u.email_verified).toBe(0);
    expect(u.password_hash).toBe(OAUTH_ONLY_HASH);
  });

  it("…and a placeholder even when the email is unused, so the real owner can't be merged into it later", async () => {
    const r = await findOrCreateOAuthUser(fx.db, ms({ email: "new@corp.example", providerUserId: "ms-9" }), allowAll);
    if (!r.ok) throw new Error("expected ok");
    expect(fx.users.get(r.userId)!).toMatchObject({ email: "microsoft-ms-9@users.noreply.shiptrack.aswincloud.com", email_verified: 0 });
    // The real owner then signs in with Google: they get their own new account.
    const owner = await findOrCreateOAuthUser(fx.db, { provider: "google", providerUserId: "g-9", email: "new@corp.example", emailVerified: true }, allowAll);
    expect(owner.ok && owner.userId).not.toBe(r.userId);
  });

  it("the same unverified Microsoft identity returns to its own separate account", async () => {
    const a = await findOrCreateOAuthUser(fx.db, ms(), allowAll);
    const b = await findOrCreateOAuthUser(fx.db, ms(), allowAll);
    expect(a.ok && b.ok && a.userId === b.userId).toBe(true);
  });

  it("a VERIFIED email links to the existing account", async () => {
    const r = await findOrCreateOAuthUser(fx.db, ms({ emailVerified: true }), allowAll);
    expect(r).toEqual({ ok: true, userId: "victim" });
  });

  it("pre-hijack: linking to an UNVERIFIED account wipes the password set at registration", async () => {
    // Attacker registered the victim's email with their own password; it was never verified.
    fx.users.set("pre", { id: "pre", email: "target@example.com", password_hash: "pbkdf2$attacker", email_verified: 0, is_admin: 0, created_at: 1 });
    fx.keys.push({ user_id: "pre", revoked_at: null });
    // The real owner later signs in with Google (verified).
    const r = await findOrCreateOAuthUser(fx.db, { provider: "google", providerUserId: "g-1", email: "target@example.com", emailVerified: true }, allowAll);
    expect(r).toEqual({ ok: true, userId: "pre" });
    expect(fx.users.get("pre")).toMatchObject({ email_verified: 1, password_hash: OAUTH_ONLY_HASH });
    expect(fx.keys[0].revoked_at).not.toBeNull();
  });

  it("linking to an already-verified account keeps its password", async () => {
    await findOrCreateOAuthUser(fx.db, { provider: "google", providerUserId: "g-2", email: "victim@example.com", emailVerified: true }, allowAll);
    expect(fx.users.get("victim")!.password_hash).toBe("pbkdf2$real");
  });

  it("the signup gate still applies to new accounts", async () => {
    const r = await findOrCreateOAuthUser(fx.db, ms({ email: "x@blocked.example", emailVerified: true }), () => false);
    expect(r).toEqual({ ok: false, error: "not_allowed" });
  });
});

describe("rate limiting", () => {
  it("take() allows up to max, then refuses", async () => {
    const { db } = makeFakeDb();
    const limit = { max: 3, windowSec: 60 };
    const results = [];
    for (let i = 0; i < 5; i++) results.push(await take(db, "k", limit));
    expect(results).toEqual([true, true, true, false, false]);
  });

  it("underLimit + recordEvent count only what's recorded (failures-only pattern)", async () => {
    const { db } = makeFakeDb();
    const limit = { max: 2, windowSec: 60 };
    expect(await underLimit(db, "login:x", limit)).toBe(true);
    await recordEvent(db, "login:x");
    await recordEvent(db, "login:x");
    expect(await underLimit(db, "login:x", limit)).toBe(false);
    expect(await underLimit(db, "login:other", limit)).toBe(true);
  });

  it("events outside the window don't count", async () => {
    const { db, events } = makeFakeDb();
    events.push({ key: "k", created_at: Math.floor(Date.now() / 1000) - 3600 });
    expect(await underLimit(db, "k", { max: 1, windowSec: 60 })).toBe(true);
  });

  it("clientIp trusts only cf-connecting-ip, never x-forwarded-for", () => {
    expect(clientIp(new Request("https://x", { headers: { "x-forwarded-for": "1.2.3.4" } }))).toBe("unknown");
    expect(clientIp(new Request("https://x", { headers: { "cf-connecting-ip": "5.6.7.8", "x-forwarded-for": "1.2.3.4" } }))).toBe("5.6.7.8");
  });
});

describe("tracking-number validation (no free text in emails)", () => {
  it("accepts each carrier's real format", () => {
    expect(validTrackingNumber("bluedart", "77612345678")).toBe(true);
    expect(validTrackingNumber("tpc", "pon7004407")).toBe(true); // upper-cased first
    expect(validTrackingNumber("ekart", "FMPP4307095480")).toBe(true);
  });
  it("rejects phishing text, URLs and wrong-carrier formats", () => {
    expect(validTrackingNumber("bluedart", "pay-at-evil.example")).toBe(false);
    expect(validTrackingNumber("shiprocket", "Customs fee due, pay at evil.example/x")).toBe(false);
    expect(validTrackingNumber("stcourier", "ABC123")).toBe(false);
    expect(validTrackingNumber("nosuchcarrier", "12345678")).toBe(false);
    // Inherited Object properties are not carriers (would throw before).
    for (const name of ["constructor", "__proto__", "toString", "hasOwnProperty"]) {
      expect(validTrackingNumber(name, "123456")).toBe(false);
    }
  });
  it("normalises like the carrier does", () => {
    expect(normaliseTrackingNumber("tpc", "  pon7004407 ")).toBe("PON7004407");
    expect(normaliseTrackingNumber("bluedart", " 776 ")).toBe("776");
  });
});

describe("watch confirm links are bound to the address", () => {
  it("round-trips and lower-cases the email", () => {
    expect(parseConfirmSubject(confirmSubject("w1", "A@B.com"))).toEqual({ watchId: "w1", email: "a@b.com" });
  });
  it("the old id-only format is rejected", () => {
    expect(parseConfirmSubject("w1")).toBeNull();
  });
});

describe("log masking", () => {
  it("keeps only the country code and last 4 digits", () => {
    expect(maskPhone("919876543210")).toBe("91******3210");
    expect(maskPhone("+1 (415) 555-0123")).toBe("14*****0123");
    expect(maskPhone("")).toBe("***");
  });
});

