import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import type { D1Database } from "@cloudflare/workers-types";
import { signToken, verifyToken } from "@aswincloud/auth";
import { getUserById } from "./db";

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

// Returns the admin user when the request has a valid session and the user
// is_admin=1. Otherwise returns a NextResponse to return immediately.
export async function requireAdmin(
  secret: string,
  db: D1Database,
  req: NextRequest,
): Promise<{ userId: string } | NextResponse> {
  const sess = await readSession(secret, req);
  if (!sess) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const user = await getUserById(db, sess.userId);
  if (!user || user.is_admin !== 1) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  return { userId: user.id };
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
