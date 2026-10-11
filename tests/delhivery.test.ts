import { describe, it, expect, afterEach, vi } from "vitest";
import { delhivery } from "@/carriers/delhivery";
import { fixture, stubFetch } from "./helpers";

afterEach(() => vi.unstubAllGlobals());

describe("delhivery parser", () => {
  it("parses the public feed (no token) into a delivered result", async () => {
    stubFetch([{ body: fixture("delhivery", "public_delivered.json") }]);
    const r = await delhivery.track("1234567890123");

    expect(r.status).toBe("delivered");
    expect(r.destination).toBe("Pondicherry");
    expect(r.estimatedDelivery).toMatch(/07 Oct 2026/);
    // trackingStates scans + the dated top-level status = newest event last.
    expect(r.events[0].description).toMatch(/Pickup|picked/i);
    expect(r.events[r.events.length - 1].description).toMatch(/Delivered/i);
  });

  it("treats an empty data array as not_found", async () => {
    stubFetch([{ body: fixture("delhivery", "public_notfound.json") }]);
    await expect(delhivery.track("0000000000000")).rejects.toMatchObject({ code: "not_found" });
  });

  it("uses the account API when a token is given", async () => {
    const spy = stubFetch([{ body: fixture("delhivery", "account_delivered.json") }]);
    const r = await delhivery.track("1234567890123", { delhiveryToken: "tok" });

    expect(r.status).toBe("delivered");
    expect(r.origin).toBe("Bangalore");
    expect(r.raw).toMatchObject({ source: "account-api" });
    // First call carries the Authorization header.
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it("falls back to the public feed when the account token is rejected (401)", async () => {
    // First response 401 (token path returns null), second is the public feed.
    stubFetch([
      { status: 401, body: "" },
      { body: fixture("delhivery", "public_delivered.json") },
    ]);
    const r = await delhivery.track("1234567890123", { delhiveryToken: "bad" });
    expect(r.status).toBe("delivered");
    expect(r.raw).toMatchObject({ source: "public" });
  });

  it("rejects a malformed waybill before fetching", async () => {
    const spy = stubFetch([{ body: "" }]);
    await expect(delhivery.track("abc")).rejects.toMatchObject({ code: "invalid_input" });
    expect(spy).not.toHaveBeenCalled();
  });
});
