import type { ShipmentStatus, TrackingEvent } from "./types";

// Carriers map scan text to a ShipmentStatus with keyword rules, and any scan
// they don't recognise ("Network Delay, Will Impact Delivery", "POD uploaded",
// a new phrase after a site redesign) lands as "unknown". If that scan is the
// newest one, the whole shipment used to read "unknown" in the API, the
// dashboard and the alert email — even though the parcel was plainly still in
// transit a scan earlier.
//
// carryForwardStatus() fills each unknown scan with the most recent known
// status before it (events are oldest-first), so an unmapped remark inherits
// the state the parcel was already in. overallStatus() then takes the newest
// known status, falling back to any carrier summary the caller has, and only
// says "unknown" when nothing at all could be read.
//
// Neither touches timestamp/description/rawCode, which is what the poller's
// last_event_hash is built from.

export function carryForwardStatus(events: TrackingEvent[]): TrackingEvent[] {
  let known: ShipmentStatus | null = null;
  return events.map((ev) => {
    if (ev.status !== "unknown") {
      known = ev.status;
      return ev;
    }
    return known ? { ...ev, status: known } : ev;
  });
}

export function overallStatus(
  events: TrackingEvent[],
  ...fallbacks: (ShipmentStatus | undefined | null)[]
): ShipmentStatus {
  for (let i = events.length - 1; i >= 0; i--) {
    if (events[i].status !== "unknown") return events[i].status;
  }
  for (const f of fallbacks) {
    if (f && f !== "unknown") return f;
  }
  return "unknown";
}
