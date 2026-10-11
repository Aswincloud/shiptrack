import { describe, it, expect, afterEach, vi } from "vitest";
import { amazon } from "@/carriers/amazon";
import { fixture, stubFetch } from "./helpers";

afterEach(() => vi.unstubAllGlobals());

describe("amazon parser", () => {
  it("parses nested JSON-string fields into a delivered result", async () => {
    stubFetch([{ body: fixture("amazon", "delivered.json") }]);
    const r = await amazon.track("405123456789");

    expect(r.status).toBe("delivered");
    expect(r.events).toHaveLength(5);
    expect(r.events[0].description).toBe("Shipping label created");
    expect(r.events[r.events.length - 1].description).toBe("Delivered");
    expect(r.estimatedDelivery).toBe("2026-10-07");
    // Location formatting "City, State, Postal"
    expect(r.events[r.events.length - 1].location).toMatch(/Pondicherry, PY, 605001/);
  });

  it("maps OutForDelivery to out_for_delivery, not delivered", async () => {
    stubFetch([{ body: fixture("amazon", "delivered.json") }]);
    const r = await amazon.track("405123456789");
    const ofd = r.events.find((e) => e.description === "Out for delivery");
    expect(ofd?.status).toBe("out_for_delivery");
  });

  it("treats TRACKING_ID_NOT_FOUND as not_found", async () => {
    stubFetch([{ body: fixture("amazon", "notfound.json") }]);
    await expect(amazon.track("405000000000")).rejects.toMatchObject({ code: "not_found" });
  });

  it("rejects a non-numeric ID before fetching", async () => {
    const spy = stubFetch([{ body: "" }]);
    await expect(amazon.track("ABC")).rejects.toMatchObject({ code: "invalid_input" });
    expect(spy).not.toHaveBeenCalled();
  });
});
