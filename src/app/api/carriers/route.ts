import { NextResponse } from "next/server";
import { listCarriers } from "@/carriers/registry";

export async function GET() {
  return NextResponse.json({ carriers: listCarriers() });
}
