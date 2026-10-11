import { describe, it, expect, afterEach, vi } from "vitest";
import { stcourier } from "@/carriers/stcourier";
import { fixture, stubFetch } from "./helpers";

afterEach(() => vi.unstubAllGlobals());

// ST Courier makes two calls: POST /track/doCheck (JSON + ci_session cookie),
// then GET /track/shipment (HTML) carrying that cookie.
const checkOk = { body: fixture("stcourier", "check_ok.json"), setCookie: ["ci_session=sess123; Path=/"] };

describe("stcourier parser", () => {
  it("parses the two-step flow into a delivered result, scans oldest-first", async () => {
    stubFetch([checkOk, { body: fixture("stcourier", "delivered.html") }]);
    const r = await stcourier.track("12345678");

    expect(r.status).toBe("delivered");
    expect(r.origin).toBe("Chennai");
    expect(r.destination).toBe("Pondicherry");
    expect(r.events).toHaveLength(4);
    // Ordered by timestamp; booked first, delivered last.
    expect(r.events[0].description).toMatch(/Booked/i);
    expect(r.events[r.events.length - 1].description).toMatch(/Delivered/i);
  });

  it("does not inherit the lagging 'Current Status' when a newer scan exists", async () => {
    // Summary cell says "In Transit" but the latest scan is Delivered.
    stubFetch([checkOk, { body: fixture("stcourier", "delivered.html") }]);
    const r = await stcourier.track("12345678");
    expect(r.status).toBe("delivered");
  });

  it("maps Out for Delivery before Delivered", async () => {
    stubFetch([checkOk, { body: fixture("stcourier", "delivered.html") }]);
    const r = await stcourier.track("12345678");
    const ofd = r.events.find((e) => /out for delivery/i.test(e.description));
    expect(ofd?.status).toBe("out_for_delivery");
  });

  it("treats a result page without the AWB heading as not_found", async () => {
    stubFetch([checkOk, { body: fixture("stcourier", "notfound.html") }]);
    await expect(stcourier.track("99999999")).rejects.toMatchObject({ code: "not_found" });
  });

  it("surfaces doCheck code 400 as invalid_input", async () => {
    stubFetch([{ body: fixture("stcourier", "check_bad.json") }]);
    await expect(stcourier.track("12345678")).rejects.toMatchObject({ code: "invalid_input" });
  });

  it("rejects a non-numeric AWB before any fetch", async () => {
    const spy = stubFetch([checkOk]);
    await expect(stcourier.track("ABC123")).rejects.toMatchObject({ code: "invalid_input" });
    expect(spy).not.toHaveBeenCalled();
  });
});
