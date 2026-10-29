import { describe, it, expect } from "vitest";
import { getCarrier, listCarriers } from "@/carriers/registry";
import { detectCarriers } from "@/carriers/detect";

describe("registry", () => {
  it("resolves every known carrier id, case-insensitively", () => {
    for (const { id } of listCarriers()) {
      expect(getCarrier(id)).toBeDefined();
      expect(getCarrier(id.toUpperCase())).toBeDefined();
    }
  });

  it("returns undefined for an unknown carrier", () => {
    expect(getCarrier("fedex")).toBeUndefined();
  });
});

describe("detectCarriers", () => {
  it("offers Ekart first for a four-letter + ten-digit id", () => {
    expect(detectCarriers("FMPP4307095480")[0]).toBe("ekart");
  });

  it("offers TPC for a short-prefix consignment", () => {
    expect(detectCarriers("PON7003911")).toContain("tpc");
  });

  it("offers digit-only carriers for a numeric id but skips privateOnly delhivery in auto", () => {
    const got = detectCarriers("12345678901234");
    expect(got).toContain("amazon");
    expect(got).not.toContain("delhivery");
  });

  it("every detected id resolves in the registry", () => {
    for (const id of detectCarriers("12345678")) {
      expect(getCarrier(id)).toBeDefined();
    }
  });

  it("returns nothing for an empty string", () => {
    expect(detectCarriers("  ")).toEqual([]);
  });
});

describe("trackOptionsFromEnv", () => {
  it("maps env names to carrier options and tolerates a missing env", async () => {
    const { trackOptionsFromEnv } = await import("@/carriers/types");
    expect(trackOptionsFromEnv({ DELHIVERY_API_TOKEN: "d", TPC_RELAY_URL: "u", TPC_RELAY_SECRET: "s" })).toEqual({
      delhiveryToken: "d",
      tpcRelayUrl: "u",
      tpcRelaySecret: "s",
    });
    expect(trackOptionsFromEnv(null)).toEqual({ delhiveryToken: undefined, tpcRelayUrl: undefined, tpcRelaySecret: undefined });
  });
});
