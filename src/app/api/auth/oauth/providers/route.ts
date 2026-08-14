import { NextResponse } from "next/server";
import { getEnv } from "@/lib/env";
import { configuredProviders } from "@aswincloud/auth";
import { oauthConfig, brokerConfigured, SITE_ID } from "@/lib/authpkg";

export const dynamic = "force-dynamic";

// Which IdP buttons the login UI should show. On the broker, this is the broker's
// own "registered-for-this-site ∩ configured-on-the-broker" list, so a provider
// appears the moment its app is added on the broker. Falls back to shiptrack's
// own configured clients when the broker isn't wired. Shape stays {providers:[id]}.
export async function GET() {
  const env = getEnv();

  if (brokerConfigured(env)) {
    try {
      const base = env.AUTH_BROKER_URL!.replace(/\/$/, "");
      const r = await fetch(`${base}/api/oauth/providers?site=${SITE_ID}`, { headers: { accept: "application/json" } });
      if (r.ok) {
        const body = (await r.json()) as { providers?: Array<{ id: string }> };
        const ids = Array.isArray(body.providers) ? body.providers.map((p) => p.id) : [];
        return NextResponse.json({ providers: ids });
      }
    } catch {
      // fall through to local
    }
  }

  return NextResponse.json({ providers: configuredProviders(oauthConfig(env)) });
}
