import { describe, it, expect } from "vitest";
import { carryForwardStatus, overallStatus, decodeEntities, stripTags } from "@/carriers/normalize";
import type { TrackingEvent } from "@/carriers/types";

const ev = (status: TrackingEvent["status"], description = ""): TrackingEvent => ({
  timestamp: "",
  status,
  description,
});

describe("carryForwardStatus", () => {
  it("fills an unknown scan with the most recent known status before it", () => {
    const out = carryForwardStatus([ev("in_transit"), ev("unknown"), ev("unknown")]);
    expect(out.map((e) => e.status)).toEqual(["in_transit", "in_transit", "in_transit"]);
  });

  it("leaves a leading unknown as unknown (nothing precedes it)", () => {
    const out = carryForwardStatus([ev("unknown"), ev("out_for_delivery")]);
    expect(out.map((e) => e.status)).toEqual(["unknown", "out_for_delivery"]);
  });

  it("does not mutate timestamp or description", () => {
    const input = [{ timestamp: "t1", status: "in_transit" as const, description: "d1" }, { timestamp: "t2", status: "unknown" as const, description: "d2" }];
    const out = carryForwardStatus(input);
    expect(out[1]).toMatchObject({ timestamp: "t2", description: "d2", status: "in_transit" });
  });
});

describe("overallStatus", () => {
  it("returns the newest known status, ignoring a trailing unknown", () => {
    expect(overallStatus([ev("in_transit"), ev("out_for_delivery"), ev("unknown")])).toBe("out_for_delivery");
  });

  it("falls back to the carrier summary when every scan is unknown", () => {
    expect(overallStatus([ev("unknown")], "delivered")).toBe("delivered");
  });

  it("is unknown when there is nothing to read", () => {
    expect(overallStatus([], undefined, null)).toBe("unknown");
  });
});

describe("decodeEntities", () => {
  it("decodes named, decimal and hex entities in one pass", () => {
    expect(decodeEntities("Tom &amp; Jerry")).toBe("Tom & Jerry");
    expect(decodeEntities("caf&#233;")).toBe("café");
    expect(decodeEntities("&#x2013;")).toBe("–");
  });

  it("does not double-unescape (&amp;#39; stays &#39;, not an apostrophe)", () => {
    expect(decodeEntities("&amp;#39;")).toBe("&#39;");
  });

  it("leaves unknown entities untouched", () => {
    expect(decodeEntities("&notareal;")).toBe("&notareal;");
  });
});

describe("stripTags", () => {
  it("drops tags, decodes entities and collapses whitespace", () => {
    expect(stripTags("<b>Hello</b>&nbsp;&nbsp;<i>world</i>")).toBe("Hello world");
  });
});
