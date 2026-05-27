import type { WatchRow } from "@/lib/db";
import type { TrackingEvent } from "@/carriers/types";

export interface NotificationPayload {
  to: string;
  watch: WatchRow;
  oldStatus: string | null;
  newStatus: string;
  event: TrackingEvent;
  unsubscribeUrl: string;
}

export interface NotifierEnv {
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
