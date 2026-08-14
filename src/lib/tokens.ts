export type TokenPurpose = "confirm" | "unsubscribe" | "session" | "password_reset" | "oauth_state";

// Payload uses a single subject field `s`. Older tokens (issued before this
// refactor) used `w` for watchId — kept as a fallback in verifyToken so
// existing unsubscribe links keep working.
interface Payload {
  s?: string;
  w?: string;
  p: TokenPurpose;
  e?: number;
}

function b64urlEncode(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function b64urlDecode(s: string): Uint8Array {
  const pad = s.length % 4 === 0 ? "" : "=".repeat(4 - (s.length % 4));
  const b64 = (s + pad).replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function hmac(secret: string, data: string): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data));
  return new Uint8Array(sig);
}

function constantTimeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

export async function signToken(
  secret: string,
  subject: string,
  purpose: TokenPurpose,
  expSeconds?: number,
): Promise<string> {
  const payload: Payload = { s: subject, p: purpose };
  if (expSeconds) payload.e = Math.floor(Date.now() / 1000) + expSeconds;
  const body = b64urlEncode(new TextEncoder().encode(JSON.stringify(payload)));
  const sig = b64urlEncode(await hmac(secret, body));
  return `${body}.${sig}`;
}

export async function verifyToken(
  secret: string,
  token: string,
  purpose: TokenPurpose,
): Promise<string | null> {
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [body, sig] = parts;
  const expected = await hmac(secret, body);
  let payload: Payload;
  try {
    // Both decodes can throw on a malformed token (atob → DOMException) — e.g. a
    // link a mail client wrapped or truncated. That's an *invalid* token, not a
    // server error, so it has to be caught rather than escaping as a 500.
    const actual = b64urlDecode(sig);
    if (!constantTimeEqual(expected, actual)) return null;
    payload = JSON.parse(new TextDecoder().decode(b64urlDecode(body))) as Payload;
  } catch {
    return null;
  }
  if (payload.p !== purpose) return null;
  if (payload.e && payload.e < Math.floor(Date.now() / 1000)) return null;
  return payload.s ?? payload.w ?? null;
}
