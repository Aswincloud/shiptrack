import { describe, it, expect } from "vitest";
import { NextRequest } from "next/server";
import { GET } from "@/app/track/dtdc/[tracking]/route";

// Next.js hands the handler an already-decoded param, so tests pass decoded values.
const call = (tracking: string) =>
  GET(new NextRequest(`https://shiptrack.example/track/dtdc/${tracking}`), { params: Promise.resolve({ tracking }) });

describe("/track/dtdc/[tracking]", () => {
  it("redirects to DTDC's own tracking page with the AWB", async () => {
    const res = await call("C5000946201");
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("https://www.dtdc.com/track-your-shipment/?awb=C5000946201");
  });

  it("normalises case and whitespace", async () => {
    const res = await call(" c5000946201 ");
    expect(res.headers.get("location")).toBe("https://www.dtdc.com/track-your-shipment/?awb=C5000946201");
  });

  it("never forwards anything but a plain AWB (no open redirect)", async () => {
    for (const bad of ["https://evil.example", "x?awb=1&next=//evil", "ab", "ABC%", "%E0%A4%A"]) {
      const res = await call(bad);
      expect(res.headers.get("location")).toBe("https://www.dtdc.com/track-your-shipment/");
    }
  });
});
