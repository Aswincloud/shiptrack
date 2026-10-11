import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { vi } from "vitest";

const HERE = dirname(fileURLToPath(import.meta.url));

/** Read a saved fixture (tests/fixtures/<carrier>/<name>). */
export function fixture(carrier: string, name: string): string {
  return readFileSync(join(HERE, "fixtures", carrier, name), "utf8");
}

/** JSON fixture, parsed. */
export function fixtureJson<T = unknown>(carrier: string, name: string): T {
  return JSON.parse(fixture(carrier, name)) as T;
}

export interface StubResponse {
  // Body for this call, as text. The carrier reads it via res.text() or res.json().
  body?: string;
  status?: number;
  // Set-Cookie headers to expose via getSetCookie() — stcourier/ekart read these.
  setCookie?: string[];
}

/**
 * Replace global.fetch with a scripted sequence of responses, one per fetch()
 * the carrier makes (Blue Dart/TPC/Shiprocket make 1; ST Courier/Ekart make 2:
 * a session/CSRF GET then the data call). Returns the spy so a test can assert
 * on the URLs that were requested.
 *
 * This keeps carriers completely offline: the parser logic is exercised against
 * a frozen fixture, so a courier deleting a delivered shipment from their own
 * database can never change what the test sees.
 */
export function stubFetch(responses: StubResponse[]) {
  let call = 0;
  const spy = vi.fn(async (_url: string | URL | Request) => {
    const r = responses[Math.min(call, responses.length - 1)];
    call++;
    const headers = new Headers();
    const cookies = r.setCookie ?? [];
    for (const c of cookies) headers.append("set-cookie", c);
    const status = r.status ?? 200;
    return {
      ok: status >= 200 && status < 300,
      status,
      headers: {
        get: (k: string) => headers.get(k),
        getSetCookie: () => cookies,
      },
      text: async () => r.body ?? "",
      json: async () => JSON.parse(r.body ?? "null"),
    } as unknown as Response;
  });
  vi.stubGlobal("fetch", spy);
  return spy;
}
