import { NextResponse } from "next/server";
import { getEnv } from "@/lib/env";
import { configuredProviders } from "@/lib/oauth";

export const dynamic = "force-dynamic";

export async function GET() {
  const env = getEnv();
  return NextResponse.json({ providers: configuredProviders(env) });
}
