import { Notifier, NotifierError } from "./types";
import { getCarrier } from "@/carriers/registry";
import { humanStatus } from "@/lib/status";
import { sendTrackingUpdate, whatsappConfigured, WhatsAppError } from "@/lib/whatsapp";

// Statuses worth a WhatsApp message. Email gets every new scan; WhatsApp is
// billed per message and interrupts a phone, so it only fires on the moments a
// person actually acts on. In-transit hops ("Vehicle Departed", "Bag Received")
// are deliberately excluded.
export const WHATSAPP_MILESTONES: ReadonlySet<string> = new Set([
  "picked_up",
  "out_for_delivery",
  "delivered",
  "exception",
  "returned",
]);

export const whatsappMeta: Notifier = {
  id: "whatsapp",
  name: "WhatsApp (Meta Cloud API)",
  async send(env, payload) {
    if (!whatsappConfigured(env)) {
      throw new NotifierError("WhatsApp not configured", "not_configured");
    }
    const w = payload.watch;
    const carrierName = getCarrier(w.carrier)?.name ?? w.carrier;
    const status = humanStatus(payload.newStatus);
    const desc = (payload.event.description ?? "").trim();
    // Avoid "Delivered: Delivered". Only append the carrier's wording when it
    // adds something beyond the status label.
    const statusText =
      desc && !desc.toLowerCase().includes(status.toLowerCase()) ? `${status} · ${desc}` : status;

    try {
      await sendTrackingUpdate(env, payload.to, {
        name: payload.recipientName ?? "",
        shipment: w.label ? `${w.label} (${w.tracking_number})` : w.tracking_number,
        // The template prefixes {{3}} with 📍; when the scan has no location the
        // carrier name is the most useful thing to put there.
        location: payload.event.location || carrierName,
        time: payload.event.timestamp || "just now",
        status: statusText,
      });
    } catch (err) {
      if (err instanceof WhatsAppError) {
        throw new NotifierError(err.message, err.code === "not_configured" ? "not_configured" : "send_failed");
      }
      throw new NotifierError(err instanceof Error ? err.message : "WhatsApp send failed", "send_failed");
    }
  },
};
