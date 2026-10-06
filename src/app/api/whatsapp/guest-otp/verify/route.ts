import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { hashOtp, otpHashEquals } from "@aswincloud/auth/d1";
import { getEnv } from "@/lib/env";
import {
  createVerifiedGuestWhatsappWatch,
  deleteGuestPhoneOtp,
  findActiveGuestWatchForPhone,
  getGuestPhoneOtp,
  incrementGuestPhoneOtpAttempts,
  PHONE_OTP_MAX_ATTEMPTS,
} from "@/lib/db";
import { formatPhoneForDisplay } from "@/lib/whatsapp";

export const dynamic = "force-dynamic";

// Guest WhatsApp alerts, step 2: check the typed code; on success create an
// active guest watch delivering to that number. The code proves the visitor
// holds the phone, and entering it is the opt-in for this shipment.

const Body = z.object({ requestId: z.string().uuid(), code: z.string().regex(/^\d{6}$/) });

export async function POST(req: NextRequest) {
  const env = getEnv();
  if (!env.DB || !env.TOKEN_SECRET) return NextResponse.json({ error: "not_configured" }, { status: 503 });
  const json = await req.json().catch(() => null);
  const parsed = Body.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: "invalid_code" }, { status: 400 });

  const otp = await getGuestPhoneOtp(env.DB, parsed.data.requestId);
  if (!otp) return NextResponse.json({ error: "no_code" }, { status: 400 });
  const now = Math.floor(Date.now() / 1000);
  if (otp.expires_at <= now) {
    await deleteGuestPhoneOtp(env.DB, otp.id);
    return NextResponse.json({ error: "expired" }, { status: 400 });
  }
  if (otp.attempts >= PHONE_OTP_MAX_ATTEMPTS) return NextResponse.json({ error: "too_many_attempts" }, { status: 429 });
  if (!otpHashEquals(await hashOtp(parsed.data.code, env.TOKEN_SECRET), otp.code_hash)) {
    await incrementGuestPhoneOtpAttempts(env.DB, otp.id);
    const left = PHONE_OTP_MAX_ATTEMPTS - (otp.attempts + 1);
    return NextResponse.json(
      { error: left > 0 ? "invalid_code" : "too_many_attempts", attemptsLeft: left },
      { status: left > 0 ? 400 : 429 },
    );
  }

  await deleteGuestPhoneOtp(env.DB, otp.id);
  const phoneDisplay = formatPhoneForDisplay(otp.phone);
  if (await findActiveGuestWatchForPhone(env.DB, otp.phone, otp.carrier, otp.tracking_number)) {
    return NextResponse.json({ status: "active", phoneDisplay, duplicate: true });
  }
  const id = crypto.randomUUID();
  await createVerifiedGuestWhatsappWatch(env.DB, {
    id,
    phone: otp.phone,
    carrier: otp.carrier,
    trackingNumber: otp.tracking_number,
    label: otp.label,
  });
  console.log("whatsapp guest watch via code", { id, carrier: otp.carrier, tracking: otp.tracking_number });
  return NextResponse.json({ status: "active", id, phoneDisplay }, { status: 201 });
}
