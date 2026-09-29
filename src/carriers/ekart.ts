import { Carrier, CarrierError, ShipmentStatus, TrackingEvent, TrackingResult } from "./types";
import { carryForwardStatus, overallStatus } from "./normalize";

// Ekart Logistics (ekartlogistics.com) — Flipkart's in-house courier. No
// developer API or credentials. Their public tracking page is a React SPA that
// reads one JSON endpoint:
//
//   POST /ekartlogistics-web-routes-api/ekartlogistics-web-proxy/trackings/v2
//        {"tracking_ids":"<ID>"}
//
// The route is guarded by a csurf-style check, so this carrier replays what
// the browser does:
//
//   1. GET /ekartlogistics-web/shipmenttrack/<ID>
//      -> HTML shell with <meta name="csrf-token" content="..."> and two
//         Set-Cookies, `session` and `session.sig`, which hold the CSRF secret.
//   2. POST the endpoint above with that token in a `csrf-token` header and
//      both cookies. Without either the reply is
//      {"csrfError":{"code":"EBADCSRFTOKEN"}}.
//
// Response (HTTP 200), keyed by tracking ID:
//
//   {"FMPP4307095480":{"expectedDeliveryDate":1790965799000,
//     "sourceCity":"BANGALORE","destinationCity":"PONDICHERRY",
//     "shipmentTrackingDetails":[
//       {"date":1790653808000,"city":"BANGALORE","statusDetails":"Shipment Created"},
//       {"date":1790667865000,"city":"BANGALORE","statusDetails":"Pickup From Seller"}, ...]}}
//
// Not-found is HTTP 200 with `{}`. Dates are epoch milliseconds.
//
// The scan list is oldest-first, but its timestamps are not monotonic (a
// "Dispatched to MotherHub" scan can carry a time seconds after creation, ahead
// of the pickup scan). Ekart's own page renders the list in array order, so we
// keep that order rather than sorting by time: the newest scan stays last,
// which is what overallStatus() and the poller's last-event hash rely on.
//
// IDs look like four letters + ten digits (FMPP…, FMPC…, NAHC…).

const BASE = "https://www.ekartlogistics.com";
const PAGE_URL = `${BASE}/ekartlogistics-web/shipmenttrack`;
const API_URL = `${BASE}/ekartlogistics-web-routes-api/ekartlogistics-web-proxy/trackings/v2`;
const UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

function mapStatus(text: string): ShipmentStatus {
  const t = text.toLowerCase();
  if (t.includes("rto") || t.includes("return")) return "returned";
  if (
    t.includes("undelivered") ||
    t.includes("not delivered") ||
    t.includes("attempt") ||
    t.includes("refused") ||
    t.includes("rejected") ||
    t.includes("cancel") ||
    t.includes("lost") ||
    t.includes("damage") ||
    t.includes("hold")
  ) {
    return "exception";
  }
  // Before "delivered": "Out For Delivery" contains "deliver".
  if (t.includes("out for delivery")) return "out_for_delivery";
  if (t.includes("delivered")) return "delivered";
  if (t.includes("pickup") || t.includes("picked")) return "picked_up";
  if (
    t.includes("received") ||
    t.includes("dispatched") ||
    t.includes("in transit") ||
    t.includes("arrived") ||
    t.includes("reached") ||
    t.includes("hub")
  ) {
    return "in_transit";
  }
  if (t.includes("created") || t.includes("manifest")) return "pending";
  return "unknown";
}

function toIso(ms: number | undefined): string | undefined {
  if (typeof ms !== "number" || !Number.isFinite(ms) || ms <= 0) return undefined;
  return new Date(ms).toISOString();
}

// Ekart returns cities in capitals ("BANGALORE"); title-case them for display.
function titleCase(s: string | undefined): string | undefined {
  const v = s?.trim();
  if (!v) return undefined;
  return v.toLowerCase().replace(/\b[a-z]/g, (c) => c.toUpperCase());
}

// Cloudflare Workers and Node expose getSetCookie(); fall back to the folded
// header for any runtime that doesn't. Returns a ready-to-send Cookie header.
function sessionCookies(res: Response): string | undefined {
  const raw: string[] = res.headers.getSetCookie?.() ?? [];
  const headers = raw.length ? raw : (res.headers.get("set-cookie") ?? "").split(/,(?=\s*[A-Za-z0-9_.-]+=)/);
  const pairs = headers
    .map((h) => h.split(";")[0].trim())
    .filter((p) => /^session(\.sig)?=/.test(p));
  return pairs.length ? pairs.join("; ") : undefined;
}

interface EkartScan {
  date?: number;
  city?: string;
  statusDetails?: string;
}

interface EkartShipment {
  expectedDeliveryDate?: number;
  sourceCity?: string;
  destinationCity?: string;
  faShipment?: boolean;
  reachedNearestHub?: boolean;
  shipmentTrackingDetails?: EkartScan[];
}

function parseEvents(scans: EkartScan[] | undefined): TrackingEvent[] {
  if (!Array.isArray(scans)) return [];
  const events: TrackingEvent[] = [];
  for (const s of scans) {
    const description = (s.statusDetails ?? "").trim();
    if (!description) continue;
    events.push({
      timestamp: toIso(s.date) ?? "",
      status: mapStatus(description),
      location: titleCase(s.city),
      description,
    });
  }
  return carryForwardStatus(events);
}

export const ekart: Carrier = {
  id: "ekart",
  name: "Ekart (Flipkart)",
  async track(trackingNumber: string): Promise<TrackingResult> {
    const cleaned = trackingNumber.trim().toUpperCase();
    if (!/^[A-Z]{2,6}[0-9]{6,14}$/.test(cleaned)) {
      throw new CarrierError("Invalid Ekart tracking ID format.", "invalid_input", 400);
    }

    const pageUrl = `${PAGE_URL}/${encodeURIComponent(cleaned)}`;
    const pageRes = await fetch(pageUrl, {
      method: "GET",
      headers: { "User-Agent": UA, Accept: "text/html" },
      cache: "no-store",
    });
    if (pageRes.status === 429) throw new CarrierError("Ekart rate-limited", "rate_limited", 429);
    if (!pageRes.ok) throw new CarrierError(`Ekart upstream error (${pageRes.status})`, "upstream_error", 502);

    const html = await pageRes.text();
    const token = html.match(/<meta\s+name="csrf-token"\s+content="([^"]+)"/i)?.[1];
    const cookies = sessionCookies(pageRes);
    if (!token || !cookies) {
      throw new CarrierError("Ekart did not issue a tracking session.", "upstream_error", 502);
    }

    const res = await fetch(API_URL, {
      method: "POST",
      headers: {
        "User-Agent": UA,
        "X-User-Agent": `${UA} EKCL/website/1`,
        Accept: "application/json",
        "Content-Type": "application/json",
        "csrf-token": token,
        Cookie: cookies,
        Origin: BASE,
        Referer: pageUrl,
      },
      body: JSON.stringify({ tracking_ids: cleaned }),
      cache: "no-store",
    });

    if (res.status === 429) throw new CarrierError("Ekart rate-limited", "rate_limited", 429);
    if (!res.ok) throw new CarrierError(`Ekart upstream error (${res.status})`, "upstream_error", 502);

    const data = (await res.json().catch(() => null)) as
      | (Record<string, EkartShipment> & { csrfError?: unknown })
      | null;
    if (!data) throw new CarrierError("Ekart returned an unreadable response.", "upstream_error", 502);
    if (data.csrfError) throw new CarrierError("Ekart rejected the tracking session.", "upstream_error", 502);

    const shipment = data[cleaned];
    if (!shipment) throw new CarrierError("Tracking number not found", "not_found", 404);

    const events = parseEvents(shipment.shipmentTrackingDetails);
    const status = overallStatus(events);
    if (!events.length && status === "unknown") {
      throw new CarrierError("Tracking number not found", "not_found", 404);
    }

    return {
      carrier: "ekart",
      trackingNumber: cleaned,
      status,
      estimatedDelivery: toIso(shipment.expectedDeliveryDate),
      origin: titleCase(shipment.sourceCity),
      destination: titleCase(shipment.destinationCity),
      events,
      fetchedAt: new Date().toISOString(),
      raw: {
        source: "ekartlogistics.com",
        faShipment: shipment.faShipment ?? null,
        reachedNearestHub: shipment.reachedNearestHub ?? null,
      },
    };
  },
};
