import type { AppEnv } from "./env";
import type { PhoneOtpRow, PhoneVerificationRow, UserRow } from "./db";
import { buildWaLink, formatPhoneForDisplay, linkMessageText, whatsappLinkingConfigured, whatsappOtpConfigured } from "./whatsapp";

// The WhatsApp linking state as Settings sees it. Built in exactly one place so
// the server-rendered page and the GET /api/whatsapp/link the page polls can't
// disagree about what "pending" or "connected" looks like.
export interface WhatsAppLinkStatus {
  available: boolean;
  // Whether "enter your number instead" can be offered (OTP template set).
  otpAvailable: boolean;
  phone: string | null;
  phoneDisplay: string | null;
  verified: boolean;
  optIn: boolean;
  pending: {
    code: string;
    message: string;
    waLink: string;
    businessNumberDisplay: string;
    expiresAt: number;
  } | null;
  // A one-time code we sent and are waiting for the user to type back.
  otp: { phoneDisplay: string; expiresAt: number } | null;
}

type StatusEnv = Pick<
  AppEnv,
  | "WHATSAPP_PHONE_NUMBER_ID"
  | "WHATSAPP_ACCESS_TOKEN"
  | "WHATSAPP_BUSINESS_NUMBER"
  | "WHATSAPP_APP_SECRET"
  | "WHATSAPP_WEBHOOK_VERIFY_TOKEN"
  | "WHATSAPP_OTP_TEMPLATE_NAME"
>;

export function whatsappStatusFor(
  env: StatusEnv,
  user: Pick<UserRow, "phone" | "phone_verified_at" | "whatsapp_opt_in">,
  pending: Pick<PhoneVerificationRow, "code" | "expires_at"> | null,
  otp: Pick<PhoneOtpRow, "phone" | "expires_at"> | null = null,
  now: number = Math.floor(Date.now() / 1000),
): WhatsAppLinkStatus {
  const available = whatsappLinkingConfigured(env);
  const liveOtp = available && otp && otp.expires_at > now ? otp : null;
  // An expired code is not "pending" — the webhook would ignore it — so the
  // page falls back to offering a fresh start rather than showing a dead code.
  const live = available && pending && pending.expires_at > now ? pending : null;
  return {
    available,
    otpAvailable: available && whatsappOtpConfigured(env),
    phone: user.phone,
    phoneDisplay: user.phone ? formatPhoneForDisplay(user.phone) : null,
    verified: user.phone_verified_at !== null,
    optIn: user.whatsapp_opt_in === 1,
    pending: live
      ? {
          code: live.code,
          message: linkMessageText(live.code),
          waLink: buildWaLink(env.WHATSAPP_BUSINESS_NUMBER!, live.code),
          businessNumberDisplay: formatPhoneForDisplay(env.WHATSAPP_BUSINESS_NUMBER!),
          expiresAt: live.expires_at,
        }
      : null,
    otp: liveOtp ? { phoneDisplay: formatPhoneForDisplay(liveOtp.phone), expiresAt: liveOtp.expires_at } : null,
  };
}
