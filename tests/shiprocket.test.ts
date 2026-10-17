import { describe, it, expect, afterEach, vi } from "vitest";
import { shiprocket } from "@/carriers/shiprocket";
import { fixture, stubFetch } from "./helpers";

afterEach(() => vi.unstubAllGlobals());

describe("shiprocket parser", () => {
  it("parses <activity> scans newest-first into an oldest-first delivered result", async () => {
    stubFetch([{ body: fixture("shiprocket", "delivered.html") }]);
    const r = await shiprocket.track("123456789");

    expect(r.status).toBe("delivered");
    expect(r.events).toHaveLength(4);
    expect(r.events[0].description).toMatch(/Pickup Done/i);
    expect(r.events[r.events.length - 1].description).toMatch(/Delivered/i);
    expect(r.events[r.events.length - 1].location).toBe("Pondicherry");
  });

  it("maps Out For Delivery before Delivered", async () => {
    stubFetch([{ body: fixture("shiprocket", "delivered.html") }]);
    const r = await shiprocket.track("123456789");
    const ofd = r.events.find((e) => /out for delivery/i.test(e.description));
    expect(ofd?.status).toBe("out_for_delivery");
  });

  it("treats an HTTP 400 as not_found", async () => {
    stubFetch([{ status: 400, body: "Not Found" }]);
    await expect(shiprocket.track("000000000")).rejects.toMatchObject({ code: "not_found" });
  });

  it("treats a 200 page with no scans and a Not Found body as not_found", async () => {
    stubFetch([{ body: fixture("shiprocket", "notfound.html") }]);
    await expect(shiprocket.track("000000000")).rejects.toMatchObject({ code: "not_found" });
  });
});

describe("shiprocket hub outscans", () => {
  // Blue Dart (behind many Shiprocket AWBs) logs "SHIPMENT OUTSCANNED TO
  // NETWORK" each time a parcel leaves a hub. That is movement, not the last
  // leg — reading it as out-for-delivery emailed a watcher too early.
  it("treats 'outscanned to network' as in transit, not out for delivery", async () => {
    stubFetch([{ body: fixture("shiprocket", "hub_outscans.html") }]);
    const r = await shiprocket.track("90697969876");

    expect(r.status).toBe("in_transit");
    expect(r.events.filter((e) => e.status === "out_for_delivery")).toHaveLength(0);
    expect(r.events[r.events.length - 1].description).toBe("SHIPMENT OUTSCANNED TO NETWORK");
  });

  it("still reads a real last-mile scan as out for delivery", async () => {
    const html = fixture("shiprocket", "hub_outscans.html").replace(
      "<ul>\n",
      '<ul>\n<li><activity>SHIPMENT OUTSCANNED FOR DELIVERY</activity><activity>KOLLAM</activity><span class="date">17 Oct 2026</span><span class="time">10:00 AM</span></li>\n',
    );
    stubFetch([{ body: html }]);
    const r = await shiprocket.track("90697969876");
    expect(r.status).toBe("out_for_delivery");
  });
});
