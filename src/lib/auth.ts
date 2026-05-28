import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { signToken, verifyToken } from "./tokens";

export const SESSION_COOKIE_NAME = "shiptrack_session";
const SESSION_TTL_SECONDS = 7 * 24 * 60 * 60;

export interface Session {
  userId: string;
}

export async function createSessionCookie(secret: string, userId: string): Promise<string> {
  const token = await signToken(secret, userId, "session", SESSION_TTL_SECONDS);
  return cookieHeader(token, SESSION_TTL_SECONDS);
}

export function clearSessionCookie(): string {
  return cookieHeader("", 0);
}

export async function readSession(secret: string, req: NextRequest): Promise<Session | null> {
  const token = req.cookies.get(SESSION_COOKIE_NAME)?.value;
  if (!token) return null;
  const userId = await verifyToken(secret, token, "session");
  return userId ? { userId } : null;
}

// Server-component variant. Reads the cookie via next/headers.
export async function readSessionFromCookies(secret: string): Promise<Session | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE_NAME)?.value;
  if (!token) return null;
  const userId = await verifyToken(secret, token, "session");
  return userId ? { userId } : null;
}

export async function requireSession(secret: string, req: NextRequest): Promise<Session | NextResponse> {
  const sess = await readSession(secret, req);
  if (!sess) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  return sess;
}

function cookieHeader(value: string, maxAgeSeconds: number): string {
  const parts = [
    `${SESSION_COOKIE_NAME}=${value}`,
    "Path=/",
    "HttpOnly",
    "Secure",
    "SameSite=Lax",
    `Max-Age=${maxAgeSeconds}`,
  ];
  return parts.join("; ");
}
