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

// A delivery attempt that failed. Couriers word these many ways ("UD - Door
// Locked", "Consignee not available", "Delivery rescheduled", "Out of delivery
// area"), and when a mapper didn't recognise one, carryForwardStatus() gave it
// the previous scan's status — usually out_for_delivery — so a failed attempt
// kept reading "out for delivery". Every text-based mapper checks this first.
// Returns to origin are left to each mapper's own "returned" rule.
const FAILED_ATTEMPT = [
  "undelivered",
  "not delivered",
  "unable to deliver",
  "reschedul",
  "door lock",
  "premises closed",
  "not available",
  "not reachable",
  "attempt",
  "refused",
  "rejected",
  "out of delivery area",
  "misrout",
];

export function isFailedAttempt(text: string): boolean {
  const t = text.toLowerCase().trim();
  if (t.includes("rto") || t.includes("return")) return false;
  // ST Courier and others prefix undelivered scans with "UD", e.g.
  // "UD - for Consignee Rescheduled Delivery".
  if (/^ud\b/.test(t)) return true;
  // "Delivered after 2 attempts" is a delivery, not a failed one.
  if (/(^|[^n])delivered/.test(t.replace(/not delivered/g, ""))) return false;
  return FAILED_ATTEMPT.some((p) => t.includes(p));
}

// Named + numeric entities, decoded in ONE pass. Chaining replace() calls
// (first &amp; -> &, then &#39; -> ') double-unescapes: the literal text
// "&amp;#39;" in a page means &#39; to the reader, but a second pass turned it
// into an apostrophe. A single regex with a callback never re-scans its own
// output, so &amp;#39; -> &#39; and stops there. (CodeQL js/double-escaping.)
const NAMED_ENTITIES: Record<string, string> = {
  nbsp: " ",
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
};

export function decodeEntities(s: string): string {
  return s.replace(/&(?:([a-z]+)|#(\d+)|#x([0-9a-f]+));/gi, (m, name?: string, dec?: string, hex?: string) => {
    if (name) return NAMED_ENTITIES[name.toLowerCase()] ?? m;
    const cp = dec ? parseInt(dec, 10) : parseInt(hex!, 16);
    if (!Number.isFinite(cp) || cp <= 0 || cp > 0x10ffff) return m;
    try {
      return String.fromCodePoint(cp);
    } catch {
      return m;
    }
  });
}

/**
 * Drop tags, decode entities, collapse whitespace. Shared by every HTML-scraping
 * carrier so they can't drift into subtly different (or unsafe) decoders.
 */
export function stripTags(html: string): string {
  return decodeEntities(html.replace(/<[^>]*>/g, " ")).replace(/\s+/g, " ").trim();
}
