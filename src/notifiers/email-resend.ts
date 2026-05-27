import { sendEmail, statusChangeEmail } from "@/lib/email";
import { Notifier, NotifierError } from "./types";

export const emailResend: Notifier = {
  id: "email",
  name: "Email (Resend)",
  async send(env, payload) {
    if (!env.RESEND_API_KEY || !env.RESEND_FROM) {
      throw new NotifierError("Resend not configured", "not_configured");
    }
    const msg = statusChangeEmail({
      carrier: payload.watch.carrier,
      trackingNumber: payload.watch.tracking_number,
      label: payload.watch.label,
      oldStatus: payload.oldStatus,
      newStatus: payload.newStatus,
      description: payload.event.description,
      location: payload.event.location,
      timestamp: payload.event.timestamp,
      unsubscribeUrl: payload.unsubscribeUrl,
    });
    await sendEmail(
      { RESEND_API_KEY: env.RESEND_API_KEY, RESEND_FROM: env.RESEND_FROM, APP_URL: env.APP_URL },
      { to: payload.to, ...msg },
    );
  },
};
