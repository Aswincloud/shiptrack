import { describe, it, expect, afterEach, vi } from "vitest";
import { bluedart } from "@/carriers/bluedart";
import { fixture, stubFetch } from "./helpers";

afterEach(() => vi.unstubAllGlobals());

describe("bluedart parser", () => {
  it("parses a delivered shipment: summary fields + scans oldest-first", async () => {
    stubFetch([{ body: fixture("bluedart", "delivered.html") }]);
    const r = await bluedart.track("77612345678");

    expect(r.status).toBe("delivered");
    expect(r.origin).toBe("MUMBAI");
    expect(r.destination).toBe("PONDICHERRY");
    expect(r.estimatedDelivery).toMatch(/09 October 2026/);
    expect(r.events).toHaveLength(4);
    // Page is newest-first; parser reverses so events[last] is the latest scan.
    expect(r.events[0].description).toMatch(/Picked Up/i);
    expect(r.events[0].status).toBe("picked_up");
    expect(r.events[r.events.length - 1].description).toMatch(/Delivered/i);
  });

  it("maps out-for-delivery without reading it as delivered", async () => {
    stubFetch([{ body: fixture("bluedart", "delivered.html") }]);
    const r = await bluedart.track("77612345678");
    const ofd = r.events.find((e) => /out for delivery/i.test(e.description));
    expect(ofd?.status).toBe("out_for_delivery");
  });

  it("treats a page with no result panel as not_found", async () => {
    stubFetch([{ body: fixture("bluedart", "notfound.html") }]);
    await expect(bluedart.track("77600000000")).rejects.toMatchObject({ code: "not_found" });
  });

  it("rejects a non-numeric tracking number before fetching", async () => {
    const spy = stubFetch([{ body: "" }]);
    await expect(bluedart.track("ABC123")).rejects.toMatchObject({ code: "invalid_input" });
    expect(spy).not.toHaveBeenCalled();
  });
});
