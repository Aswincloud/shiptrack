import { getCloudflareContext } from "@opennextjs/cloudflare";
import type { D1Database } from "@cloudflare/workers-types";

export interface AppEnv {
  DB: D1Database;
  TOKEN_SECRET: string;
  RESEND_API_KEY: string;
  RESEND_FROM: string;
  APP_URL: string;
  ADMIN_TOKEN?: string;
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  GITHUB_CLIENT_ID?: string;
  GITHUB_CLIENT_SECRET?: string;
  MICROSOFT_CLIENT_ID?: string;
  MICROSOFT_CLIENT_SECRET?: string;
  MICROSOFT_TENANT_ID?: string;
  DELHIVERY_API_TOKEN?: string;
}

export function getEnv(): AppEnv {
  const { env } = getCloudflareContext();
  return env as unknown as AppEnv;
}

// Async variant — safe to call in async server components / layouts that
// would otherwise be statically prerendered. Returns null at build time when
// no Cloudflare context is available.
export async function getEnvAsync(): Promise<AppEnv | null> {
  try {
    const { env } = await getCloudflareContext({ async: true });
    return env as unknown as AppEnv;
  } catch {
    return null;
  }
}
