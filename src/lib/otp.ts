export const OTP_TTL_SECONDS = 10 * 60;
export const OTP_MAX_ATTEMPTS = 5;
export const OTP_RESEND_COOLDOWN_SECONDS = 60;

export function generateOtp(): string {
  // 6 digits, leading zeros preserved. Uses crypto.getRandomValues to avoid Math.random bias.
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return (buf[0] % 1_000_000).toString().padStart(6, "0");
}

export async function hashOtp(code: string, pepper: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${code}|${pepper}`));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export function constantTimeEqualString(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
