import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { generateOtp } from "@aswincloud/auth/d1";
import { getEnv } from "@/lib/env";
import { readSession } from "@/lib/auth";
import {
  deletePhoneVerification,
  findPhoneVerificationByCode,
  getPhoneVerification,
  getUserById,
  setWhatsappOptIn,
  unlinkUserPhone,
  upsertPhoneVerification,
  PHONE_LINK_TTL_SECONDS,
} from "@/lib/db";
import { whatsappLinkingConfigured } from "@/lib/whatsapp";
import { whatsappStatusFor } from "@/lib/whatsapp-status";

export const dynamic = "force-dynamic";

// The signed-in user's side of WhatsApp linking. The webhook does the actual
// binding when their message arrives; these endpoints hand out the code, report
// state (Settings polls GET while waiting), toggle alerts, and unlink.

export async function GET(req: NextRequest) {
  const env = getEnv();
  if (!env.DB || !env.TOKEN_SECRET) return NextResponse.json({ error: "not_configured" }, { status: 503 });
  const sess = await readSession(env.TOKEN_SECRET, req);
  if (!sess) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const user = await getUserById(env.DB, sess.userId);
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const pending = await getPhoneVerification(env.DB, user.id);
  return NextResponse.json(whatsappStatusFor(env, user, pending));
}

// Start (or restart) linking: mint a code and return the wa.me link. Re-using
// an unexpired code is fine — nothing was sent, so nothing is wasted — but a
// fresh POST always issues a fresh code so "Get a new code" means what it says.
export async function POST(req: NextRequest) {
  const env = getEnv();
  if (!env.DB || !env.TOKEN_SECRET) return NextResponse.json({ error: "not_configured" }, { status: 503 });
  if (!whatsappLinkingConfigured(env)) return NextResponse.json({ error: "not_configured" }, { status: 503 });
  const sess = await readSession(env.TOKEN_SECRET, req);
  if (!sess) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const user = await getUserById(env.DB, sess.userId);
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const now = Math.floor(Date.now() / 1000);
  // Six digits from a CSPRNG; retry on the (vanishingly rare) live collision so
  // an inbound code can only ever mean one account.
  let code = generateOtp();
  for (let i = 0; i < 5 && (await findPhoneVerificationByCode(env.DB, code, now)); i++) code = generateOtp();
  const expiresAt = now + PHONE_LINK_TTL_SECONDS;
  await upsertPhoneVerification(env.DB, user.id, code, expiresAt);

  return NextResponse.json(whatsappStatusFor(env, user, { code, expires_at: expiresAt }), { status: 201 });
}

const PatchBody = z.object({ optIn: z.boolean() });

export async function PATCH(req: NextRequest) {
  const env = getEnv();
  if (!env.DB || !env.TOKEN_SECRET) return NextResponse.json({ error: "not_configured" }, { status: 503 });
  const sess = await readSession(env.TOKEN_SECRET, req);
  if (!sess) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const json = await req.json().catch(() => null);
  const parsed = PatchBody.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: "invalid_input" }, { status: 400 });

  const ok = await setWhatsappOptIn(env.DB, sess.userId, parsed.data.optIn);
  if (!ok) return NextResponse.json({ error: "not_linked" }, { status: 409 });
  return NextResponse.json({ status: "ok", optIn: parsed.data.optIn });
}

// Unlink the number (and drop any outstanding code). Also what "Cancel" does
// while waiting for a message that never came.
export async function DELETE(req: NextRequest) {
  const env = getEnv();
  if (!env.DB || !env.TOKEN_SECRET) return NextResponse.json({ error: "not_configured" }, { status: 503 });
  const sess = await readSession(env.TOKEN_SECRET, req);
  if (!sess) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  await unlinkUserPhone(env.DB, sess.userId);
  await deletePhoneVerification(env.DB, sess.userId);
  return new NextResponse(null, { status: 204 });
}
