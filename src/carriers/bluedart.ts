import { Carrier, CarrierError, ShipmentStatus, TrackingEvent, TrackingResult } from "./types";

// Blue Dart's commercial "Tracking API" requires customer credentials (LoginID
// and a tracking-API License Key) issued by a Blue Dart account manager. They
// are not free and not obtainable through the DHL Developer Portal.
//
// Instead we scrape the public Liferay-rendered tracking page that any user
// visits at bluedart.com. All data is server-rendered into the HTML; no JS
// execution required. Fields are pulled from the "Shipment Details" and
// "Status and Scans" tables.
//
// Risk: if Blue Dart redesigns the page, parsing breaks. The current selectors
// are deliberately loose (label-text matching) to survive minor HTML changes.

const TRACK_URL = "https://www.bluedart.com/trackdartresultthirdparty";
const UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

function mapStatus(text: string): ShipmentStatus {
  const t = text.toLowerCase();
  if (t.includes("delivered") && !t.includes("attempted") && !t.includes("undelivered")) return "delivered";
  if (t.includes("out for delivery")) return "out_for_delivery";
  if (t.includes("returned") || t.includes("rto")) return "returned";
  if (t.includes("picked up") || t.includes("pickup")) return "picked_up";
  if (t.includes("address incomplete") || t.includes("premises closed") || t.includes("undelivered") || t.includes("attempt")) {
    return "exception";
  }
  if (t.includes("in transit") || t.includes("arrived") || t.includes("connected") || t.includes("shipped")) {
    return "in_transit";
  }
  return "unknown";
}

function stripTags(s: string): string {
  return s
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}

// Pull the value cell next to a <th> whose text matches the given label.
function fieldByLabel(html: string, label: string): string | undefined {
  const re = new RegExp(
    `<th[^>]*>\\s*${label.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\\\$&")}\\s*</th>\\s*<td[^>]*>([\\s\\S]*?)</td>`,
    "i",
  );
  const m = html.match(re);
  if (!m) return undefined;
  const v = stripTags(m[1]);
  return v.length ? v : undefined;
}

// Parse the "Status and Scans" tbody into individual TrackingEvent rows.
function parseScans(html: string): TrackingEvent[] {
  const scanSection = html.match(/Status and Scans[\s\S]*?<tbody>([\s\S]*?)<\/tbody>/i);
  if (!scanSection) return [];

  const rows = scanSection[1].match(/<tr>[\s\S]*?<\/tr>/gi) ?? [];
  const events: TrackingEvent[] = [];

  for (const row of rows) {
    const cells = Array.from(row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)).map((m) => stripTags(m[1]));
    if (cells.length < 4) continue;
    const [location, description, dateStr, timeStr] = cells;
    if (!description) continue;
    events.push({
      timestamp: `${dateStr} ${timeStr}`.trim(),
      status: mapStatus(description),
      location: location || undefined,
      description,
    });
  }

  // Page renders most-recent first; reverse so caller's `events[last]` is latest.
  return events.reverse();
}

export const bluedart: Carrier = {
  id: "bluedart",
  name: "Blue Dart",
  async track(trackingNumber: string): Promise<TrackingResult> {
    const cleaned = trackingNumber.trim();
    if (!/^[0-9]{6,20}$/.test(cleaned)) {
      throw new CarrierError("Invalid Blue Dart tracking number format.", "invalid_input", 400);
    }

    const url = `${TRACK_URL}?trackFor=0&trackNo=${encodeURIComponent(cleaned)}`;
    const res = await fetch(url, {
      method: "GET",
      headers: { "User-Agent": UA, Accept: "text/html" },
      cache: "no-store",
    });

    if (res.status === 429) throw new CarrierError("Blue Dart rate-limited", "rate_limited", 429);
    if (!res.ok) throw new CarrierError(`Blue Dart upstream error (${res.status})`, "upstream_error", 502);

    const html = await res.text();

    // The page always returns 200; existence is signalled by an
    // `id="{awb}-rdrmv"` result panel. The "no information on the Waybill"
    // copy lives inside a hidden div on every page, so don't use it.
    const panelRe = new RegExp(`id="${cleaned}-rdrmv"[\\s\\S]*?(?=<!--\\s*AWB${cleaned}\\s*-->|$)`, "i");
    const panelMatch = html.match(panelRe);
    if (!panelMatch || /Records Not Found/i.test(html)) {
      throw new CarrierError("Tracking number not found", "not_found", 404);
    }
    const panel = panelMatch[0];

    const status = fieldByLabel(panel, "Status");
    const expectedDelivery = fieldByLabel(panel, "Expected Date of Delivery");
    const origin = fieldByLabel(panel, "From");
    const destination = fieldByLabel(panel, "To");
    const events = parseScans(panel);
    const latest = events[events.length - 1];

    return {
      carrier: "bluedart",
      trackingNumber: cleaned,
      status: latest ? latest.status : status ? mapStatus(status) : "unknown",
      estimatedDelivery: expectedDelivery,
      origin,
      destination,
      events,
      fetchedAt: new Date().toISOString(),
      raw: { source: "scrape", url },
    };
  },
};
