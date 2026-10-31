import { describe, it, expect } from "vitest";
import { NextRequest } from "next/server";
import { GET } from "@/app/track/dtdc/[tracking]/route";

const call = (tracking: string) =>
  GET(new NextRequest(`https://shiptrack.example/track/dtdc/${tracking}`), { params: Promise.resolve({ tracking }) });

describe("/track/dtdc/[tracking]", () => {
  it("redirects to DTDC's own tracking page with the AWB", async () => {
    const res = await call("C5000946201");
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("https://www.dtdc.com/track-your-shipment/?awb=C5000946201");
  });

  it("normalises case and whitespace", async () => {
    const res = await call(encodeURIComponent(" c5000946201 "));
    expect(res.headers.get("location")).toBe("https://www.dtdc.com/track-your-shipment/?awb=C5000946201");
  });

  it("never forwards anything but a plain AWB (no open redirect)", async () => {
    for (const bad of [encodeURIComponent("https://evil.example"), encodeURIComponent("x?awb=1&next=//evil"), "ab"]) {
      const res = await call(bad);
      expect(res.headers.get("location")).toBe("https://www.dtdc.com/track-your-shipment/");
    }
  });
});
