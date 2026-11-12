import type { WatchRow } from "./db";

// What a watch looks like over the API. Internal bookkeeping (event hash, poll
// failures) stays out; the recipient is shown as its owner set it.
export function publicWatch(w: WatchRow) {
  return {
    id: w.id,
    carrier: w.carrier,
    trackingNumber: w.tracking_number,
    label: w.label,
    status: w.status,
    shipmentStatus: w.last_known_status,
    estimatedDelivery: w.estimated_delivery,
    email: w.email || null,
    pollIntervalSeconds: w.poll_interval_seconds,
    lastPolledAt: w.last_polled_at,
    createdAt: w.created_at,
    completedAt: w.completed_at,
  };
}
