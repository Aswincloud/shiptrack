import { NextRequest, NextResponse } from "next/server";
import { getCarrier } from "@/carriers/registry";
import { CarrierError } from "@/carriers/types";

export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ carrier: string; tracking: string }> },
) {
  const { carrier: carrierId, tracking } = await ctx.params;
  const carrier = getCarrier(carrierId);
  if (!carrier) {
    return NextResponse.json({ error: "carrier_not_supported", carrier: carrierId }, { status: 404 });
  }

  try {
    const result = await carrier.track(tracking);
    const { raw: _raw, ...publicResult } = result;
    return NextResponse.json(publicResult, {
      headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600" },
    });
  } catch (err) {
    if (err instanceof CarrierError) {
      return NextResponse.json({ error: err.code, message: err.message }, { status: err.status });
    }
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
