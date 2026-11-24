import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import type { D1Database } from "@cloudflare/workers-types";
import { signToken, verifyToken } from "@aswincloud/auth";
import { securityStamp } from "@aswincloud/auth/d1";
import { getUserById } from "./db";
import { getEnvAsync } from "./env";
import { userIdForApiKey, API_KEY_PREFIX } from "./api-keys";

export const SESSION_COOKIE_NAME = "shiptrack_session";
const SESSION_TTL_SECONDS = 7 * 24 * 60 * 60;

export interface Session {
  userId: string;
}

// A session token's subject is `<userId>.<stamp>`, where the stamp is a
// fingerprint of the user's current password hash (securityStamp). Changing or
// resetting the password, or wiping it when an OAuth login takes over an
// unverified account, changes the stamp — so every existing session for that
// account stops working at once, including a stolen one. Tokens are otherwise
// stateless (HMAC + expiry); the stamp check costs one indexed user lookup.
// Tokens minted before this scheme (subject = bare userId) fail the check, so
// everyone signed in before it shipped was asked to sign in again once.

/** Sign a session for this user. Pass the db so the stamp is read fresh. */
export async function createSessionCookie(secret: string, userId: string, db?: D1Database): Promise<string> {
  const dbx = db ?? (await getEnvAsync())?.DB;
  const user = dbx ? await getUserById(dbx, userId) : null;
  if (!user) throw new Error("createSessionCookie: user not found");
  return createSessionCookieForUser(secret, user);
}

/**
 * Session for a user row the caller already holds — login passes the exact row
 * whose password it just verified, so the stamp can't come from a password set
 * by a concurrent change between the check and the cookie.
 */
export async function createSessionCookieForUser(
  secret: string,
  user: { id: string; password_hash: string },
): Promise<string> {
  const token = await signToken(secret, `${user.id}.${await securityStamp(user)}`, "session", SESSION_TTL_SECONDS);
  return cookieHeader(token, SESSION_TTL_SECONDS);
}

/** Resolve a verified session subject to a live user whose stamp still matches. */
async function sessionUser(subject: string | null): Promise<Session | null> {
  if (!subject) return null;
  const dot = subject.lastIndexOf(".");
  if (dot <= 0) return null; // pre-stamp token
  const userId = subject.slice(0, dot);
  const db = (await getEnvAsync())?.DB;
  if (!db) return null;
  const user = await getUserById(db, userId);
  if (!user) return null; // deleted account
  if ((await securityStamp(user)) !== subject.slice(dot + 1)) return null; // password changed since
  return { userId: user.id };
}

export function clearSessionCookie(): string {
  return cookieHeader("", 0);
}

export async function readSession(secret: string, req: NextRequest): Promise<Session | null> {
  const token = req.cookies.get(SESSION_COOKIE_NAME)?.value;
  if (!token) return null;
  return sessionUser(await verifyToken(secret, token, "session"));
}

// Server-component variant. Reads the cookie via next/headers.
export async function readSessionFromCookies(secret: string): Promise<Session | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE_NAME)?.value;
  if (!token) return null;
  return sessionUser(await verifyToken(secret, token, "session"));
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

// The account behind a request: the session cookie, or a personal API key sent
// as "Authorization: Bearer st_…". Returns
//   { userId, via }  when either authenticates,
//   null             when the request carries neither (a signed-out visitor),
//   "invalid"        when it offers an st_ key that is unknown or revoked.
// A bad key is an error, not a downgrade to signed-out: falling through would
// turn a typo'd key into a silent guest request.
//
// Other Bearer tokens (the operator's ADMIN_TOKEN) are left to the caller.
export async function readCaller(
  secret: string,
  db: D1Database,
  req: NextRequest,
): Promise<{ userId: string; via: "session" | "api_key" } | null | "invalid"> {
  const sess = await readSession(secret, req);
  if (sess) return { userId: sess.userId, via: "session" };
  const auth = req.headers.get("authorization") ?? "";
  const bearer = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  if (!bearer.startsWith(API_KEY_PREFIX)) return null;
  const userId = await userIdForApiKey(db, bearer);
  return userId ? { userId, via: "api_key" } : "invalid";
}
