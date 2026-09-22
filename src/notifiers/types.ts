import type { WatchRow } from "@/lib/db";
import type { TrackingEvent } from "@/carriers/types";
import type { WhatsAppEnv } from "@/lib/whatsapp";

export interface NotificationPayload {
  // Recipient address in the notifier's own terms: an email address for the
  // email notifier, E.164 digits for WhatsApp.
  to: string;
  // Recipient's display name, when the notifier can use one (WhatsApp's {{1}}).
  recipientName?: string | null;
  watch: WatchRow;
  oldStatus: string | null;
  newStatus: string;
  event: TrackingEvent;
  // Carrier's expected delivery date, when it publishes one.
  estimatedDelivery?: string | null;
  unsubscribeUrl: string;
}

export interface NotifierEnv extends WhatsAppEnv {
  RESEND_API_KEY?: string;
  RESEND_FROM?: string;
  APP_URL: string;
}

export interface Notifier {
  id: string;
  name: string;
  send(env: NotifierEnv, payload: NotificationPayload): Promise<void>;
}

export class NotifierError extends Error {
  constructor(message: string, public readonly code: "not_implemented" | "not_configured" | "send_failed") {
    super(message);
    this.name = "NotifierError";
  }
}
