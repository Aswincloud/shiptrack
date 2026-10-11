import { describe, it, expect, afterEach } from "vitest";
import { vi } from "vitest";
import { tpc } from "@/carriers/tpc";
import { CarrierError } from "@/carriers/types";
import { fixture, stubFetch } from "./helpers";

afterEach(() => vi.unstubAllGlobals());

describe("tpc parser (real mobile-feed fixtures)", () => {
  it("parses an in-transit consignment oldest-first with the latest scan last", async () => {
    stubFetch([{ body: fixture("tpc", "in_transit.txt") }]);
    const r = await tpc.track("PON7003911");

    expect(r.carrier).toBe("tpc");
    expect(r.events.length).toBeGreaterThan(0);
    // The feed is newest-first; the parser must flip it so events[last] is latest.
    const latest = r.events[r.events.length - 1];
    expect(latest.description).toMatch(/Despatched to Ahmedabad/i);
    expect(latest.location).toBe("Ahmedabad");
    expect(r.status).toBe("in_transit");
    // DD/MM/YYYY -> "10 Oct 2026 ..."
    expect(latest.timestamp).toMatch(/10 Oct 2026/);
  });

  it("reads a delivered feed as delivered", async () => {
    stubFetch([{ body: fixture("tpc", "delivered.txt") }]);
    const r = await tpc.track("PON0000001");
    expect(r.status).toBe("delivered");
    expect(r.events[r.events.length - 1].description).toMatch(/delivered/i);
  });

  it("reads an out-for-delivery feed as out_for_delivery", async () => {
    stubFetch([{ body: fixture("tpc", "out_for_delivery.txt") }]);
    const r = await tpc.track("PON7003482");
    expect(r.status).toBe("out_for_delivery");
  });

  it("treats a header-only feed (no scans) as not_found", async () => {
    stubFetch([{ body: fixture("tpc", "notfound.txt") }]);
    await expect(tpc.track("ZZZZ0000000")).rejects.toMatchObject({
      code: "not_found",
    } satisfies Partial<CarrierError>);
  });

  it("rejects a malformed consignment number before any fetch", async () => {
    const spy = stubFetch([{ body: "" }]);
    await expect(tpc.track("!!")).rejects.toMatchObject({ code: "invalid_input" });
    expect(spy).not.toHaveBeenCalled();
  });

  it("raises upstream_error when the body is not the TPC feed", async () => {
    stubFetch([{ body: "<html>Oops, something went wrong</html>" }]);
    await expect(tpc.track("PON7003911")).rejects.toMatchObject({ code: "upstream_error" });
  });
});
