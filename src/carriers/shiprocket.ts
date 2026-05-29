import { Carrier, CarrierError, ShipmentStatus, TrackingEvent, TrackingResult } from "./types";

// Shiprocket is a shipping aggregator. Its public tracking page resolves any
// AWB to its underlying courier (Blue Dart, Delhivery, Ekart, XpressBees, …)
// and server-renders the full scan history into the HTML — no auth, no JS.
//
// We parse:
//   - top status: <p id="shipment_status"> ... <span class="status_*">Text</span>
//   - courier:    .courier_info  <b>Courier Name</b> + .tracking_id
//   - scans:      <li> blocks with <activity>Activity</activity>,
//                 <activity>Location</activity>, <span class="date"> and
//                 <span class="time">
//
// If Shiprocket redesigns the page, parsing breaks; selectors are kept loose.

const TRACK_URL = "https://shiprocket.co/tracking";
const UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

function mapStatus(text: string): ShipmentStatus {
  const t = text.toLowerCase();
  // Order matters: check the "negative" / exception phrases that contain the
  // word "delivered" (e.g. "undelivered") before the plain "delivered" check.
  if (t.includes("rto") || t.includes("returned") || t.includes("return to origin")) return "returned";
  if (t.includes("undelivered") || t.includes("unable to deliver") || t.includes("not delivered") || t.includes("closed") || t.includes("exception") || t.includes("failed") || t.includes("incomplete") || t.includes("incorrect")) {
    return "exception";
  }
  if (t.includes("delivered")) return "delivered";
  if (t.includes("out for delivery") || t.includes("outscan") || t.includes("dispatched")) return "out_for_delivery";
  if (t.includes("picked") || t.includes("pickup") || t.includes("pick up")) return "picked_up";
  if (t.includes("transit") || t.includes("in-scan") || t.includes("inscan") || t.includes("arrived") || t.includes("bag") || t.includes("received") || t.includes("shipment") || t.includes("order received")) {
    return "in_transit";
  }
  return "unknown";
}

function stripTags(s: string): string {
  return s
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#0?39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}

function firstGroup(html: string, re: RegExp): string | undefined {
  const m = html.match(re);
  return m ? stripTags(m[1]) || undefined : undefined;
}

function parseScans(html: string): TrackingEvent[] {
  const lis = html.match(/<li[^>]*>[\s\S]*?<\/li>/gi) ?? [];
  const events: TrackingEvent[] = [];

  for (const li of lis) {
    // Only scan rows contain an <activity> tag.
    const acts = Array.from(li.matchAll(/<activity>([\s\S]*?)<\/activity>/gi)).map((m) => stripTags(m[1]));
    if (acts.length === 0) continue;
    const description = acts[0] ?? "";
    const location = acts[1] || undefined;
    if (!description) continue;

    const date = firstGroup(li, /<span[^>]*class=['"]date['"][^>]*>([\s\S]*?)<\/span>/i);
    const time = firstGroup(li, /<span[^>]*class=['"]time['"][^>]*>([\s\S]*?)<\/span>/i);
    const timestamp = [date, time].filter(Boolean).join(" ");

    events.push({
      timestamp,
      status: mapStatus(description),
      location,
      description,
    });
  }

  // Page lists newest first; reverse so caller's events[last] is the latest.
  return events.reverse();
}

export const shiprocket: Carrier = {
  id: "shiprocket",
  name: "Shiprocket (any courier)",
  async track(trackingNumber: string): Promise<TrackingResult> {
    const cleaned = trackingNumber.trim();
    if (!/^[A-Za-z0-9-]{6,30}$/.test(cleaned)) {
      throw new CarrierError("Invalid tracking number format.", "invalid_input", 400);
    }

    const url = `${TRACK_URL}/${encodeURIComponent(cleaned)}`;
    const res = await fetch(url, {
      method: "GET",
      headers: { "User-Agent": UA, Accept: "text/html" },
      cache: "no-store",
    });

    if (res.status === 429) throw new CarrierError("Shiprocket rate-limited", "rate_limited", 429);
    // Shiprocket returns HTTP 400 with a "Not Found" body for unknown AWBs.
    if (res.status === 400 || res.status === 404) {
      throw new CarrierError("Tracking number not found", "not_found", 404);
    }
    if (!res.ok) throw new CarrierError(`Shiprocket upstream error (${res.status})`, "upstream_error", 502);

    const html = await res.text();

    const events = parseScans(html);
    if (events.length === 0 && /Not Found|no information|invalid waybill/i.test(html)) {
      throw new CarrierError("Tracking number not found", "not_found", 404);
    }

    // Top-of-page status label, e.g. <p id="shipment_status"> ... Undelivered</p>
    const statusBlock = firstGroup(html, /id=['"]shipment_status['"][^>]*>([\s\S]*?)<\/p>/i);
    const courier = firstGroup(html, /class=['"][^'"]*courier_info[^'"]*['"][\s\S]*?<b>([\s\S]*?)<\/b>/i);

    // Prefer the latest scan's status — the page's top label can carry HTML
    // comment artifacts and ambiguous wording. Fall back to the label only
    // when there are no scans.
    const latest = events[events.length - 1];
    const status: ShipmentStatus = latest
      ? latest.status
      : statusBlock
        ? mapStatus(statusBlock)
        : "unknown";

    return {
      carrier: "shiprocket",
      trackingNumber: cleaned,
      status,
      origin: undefined,
      destination: undefined,
      events,
      fetchedAt: new Date().toISOString(),
      raw: { source: "scrape", url, courier: courier ?? null, statusLabel: statusBlock ?? null },
    };
  },
};
