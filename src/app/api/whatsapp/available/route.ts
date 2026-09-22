import { NextResponse } from "next/server";
import { getEnv } from "@/lib/env";
import { whatsappLinkingConfigured } from "@/lib/whatsapp";

export const dynamic = "force-dynamic";

// Lets client components decide whether to offer WhatsApp at all. Reveals
// nothing but a boolean.
export async function GET() {
  const env = getEnv();
  return NextResponse.json({ available: whatsappLinkingConfigured(env) });
}
