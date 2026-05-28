import { getCloudflareContext } from "@opennextjs/cloudflare";
import type { D1Database } from "@cloudflare/workers-types";

export interface AppEnv {
  DB: D1Database;
  TOKEN_SECRET: string;
  RESEND_API_KEY: string;
  RESEND_FROM: string;
  APP_URL: string;
  ADMIN_TOKEN?: string;
}

export function getEnv(): AppEnv {
  const { env } = getCloudflareContext();
  return env as unknown as AppEnv;
}
