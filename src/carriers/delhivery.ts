import {
  Carrier,
  CarrierError,
  ShipmentStatus,
  TrackingEvent,
  TrackingResult,
  TrackOptions,
} from "./types";

// Delhivery is tracked from two sources, best-first.
//
// 1. The token-gated account API, when DELHIVERY_API_TOKEN is configured. It
//    returns a full, dated scan history but only for shipments booked under the
//    operator's own account.
//      https://track.delhivery.com/api/v1/packages/json/?token=<TOKEN>&waybill=<AWB>&verbose=2
//    Success envelope:
//      { ShipmentData: [ { Shipment: {
//          Status: { Status, StatusDateTime, StatusLocation, Instructions },
//          Scans: [ { ScanDetail: { Scan, ScanDateTime, ScannedLocation, Instructions, StatusCode } } ],
//          Origin, Destination, ExpectedDeliveryDate, ... } } ] }
//    Not-found envelope:
//      { Success: false, Error: "No such waybill or Order Id found" }
//
// 2. The endpoint Delhivery's own public tracking page calls, for everything
//    else. It needs no credentials — the only gate is an Origin header:
//      GET https://dlv-api.delhivery.com/v3/unified-tracking?wbn=<AWB>
//      Origin: https://www.delhivery.com
//    Without that header it answers 401 "ERROR: Invalid Origin". It accepts
//    11-14 digit numeric waybills; 10 digits or any letter gets a 400
//    "Please enter a valid waybill number (WBN)", and an unknown-but-well-formed
//    AWB comes back as 200 with `{"message":"invalid AWB or very old package",
//    "data":[]}`.
//
// The public feed is deliberately thinner than the account API: it carries the
// current status and the expected delivery date, but its per-scan `scanDate` /
// `scanDateTime` fields come back empty (verbose=2, scans=true, pt=true and
// expand=scans all return the same thing). Only top-level `status.statusDateTime`
// is reliably dated, which is why parsePublicEvents always ends on an event
// built from it — the poller's `timestamp|rawCode|description` change hash needs
// a timestamp that actually moves.
//
// So this carrier is no longer `privateOnly`: any AWB resolves, and the
// operator's own additionally get full scan history.

const TRACK_URL = "https://track.delhivery.com/api/v1/packages/json/";
const PUBLIC_URL = "https://dlv-api.delhivery.com/v3/unified-tracking";
const PUBLIC_ORIGIN = "https://www.delhivery.com";
const UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

function mapStatus(statusType: string | undefined, status: string | undefined): ShipmentStatus {
  // Delhivery exposes a coarse "StatusType" (UD = undelivered/in-transit, DL =
  // delivered, RT = RTO/returned, PU = pickup) plus a free-text Status. Use
  // both, preferring the explicit code.
  const code = (statusType ?? "").toUpperCase();
  if (code === "DL") return "delivered";
  if (code === "RT") return "returned";
  if (code === "PU") return "picked_up";

  const t = (status ?? "").toLowerCase();
  if (t.includes("rto") || t.includes("returned") || t.includes("return to")) return "returned";
  if (t.includes("delivered")) return "delivered";
  if (t.includes("out for delivery") || t.includes("dispatched") || t.includes("out scan") || t.includes("outscan"))
    return "out_for_delivery";
  if (
    t.includes("undelivered") ||
    t.includes("not delivered") ||
    t.includes("unable") ||
    t.includes("failed") ||
    t.includes("exception") ||
    t.includes("hold") ||
    t.includes("address") ||
    t.includes("closed")
  )
    return "exception";
  if (t.includes("picked") || t.includes("pickup") || t.includes("pick up") || t.includes("manifest")) return "picked_up";
  if (
    t.includes("transit") ||
    t.includes("scan") ||
    t.includes("received") ||
    t.includes("departed") ||
    t.includes("arrived") ||
    t.includes("bag")
  )
    return "in_transit";
  return "unknown";
}

// ---------------------------------------------------------------------------
// Source 1: token-gated account API
// ---------------------------------------------------------------------------

interface ScanDetail {
  Scan?: string;
  ScanDateTime?: string;
  ScannedLocation?: string;
  Instructions?: string;
  StatusCode?: string;
  StatusType?: string;
}

function parseScans(scans: Array<{ ScanDetail?: ScanDetail }> | undefined): TrackingEvent[] {
  if (!Array.isArray(scans)) return [];
  const events: TrackingEvent[] = [];
  for (const s of scans) {
    const d = s?.ScanDetail;
    if (!d) continue;
    const description = d.Instructions || d.Scan || "";
    if (!description) continue;
    events.push({
      timestamp: d.ScanDateTime ?? "",
      status: mapStatus(d.StatusType, d.Scan || d.Instructions),
      location: d.ScannedLocation || undefined,
      description,
      rawCode: d.StatusCode || undefined,
    });
  }
  // Delhivery returns scans oldest-first; keep that so events[last] is latest.
  return events;
}

// Returns null when the AWB simply isn't under this account, so the caller can
// fall through to the public feed. Throws only on malformed responses.
async function trackViaToken(cleaned: string, token: string): Promise<TrackingResult | null> {
  const url = `${TRACK_URL}?waybill=${encodeURIComponent(cleaned)}&verbose=2`;
  const res = await fetch(url, {
    method: "GET",
    headers: { "User-Agent": UA, Accept: "application/json", Authorization: `Token ${token}` },
    cache: "no-store",
  });

  if (res.status === 401 || res.status === 403) {
    // Bad or revoked token. Not fatal any more — the public feed still works.
    return null;
  }
  if (res.status === 429) throw new CarrierError("Delhivery rate-limited", "rate_limited", 429);
  if (!res.ok) throw new CarrierError(`Delhivery upstream error (${res.status})`, "upstream_error", 502);

  const data = (await res.json()) as {
    Success?: boolean;
    Error?: string;
    ShipmentData?: Array<{
      Shipment?: {
        Status?: { Status?: string; StatusType?: string; StatusDateTime?: string; StatusLocation?: string; Instructions?: string };
        Scans?: Array<{ ScanDetail?: ScanDetail }>;
        Origin?: string;
        Destination?: string;
        ExpectedDeliveryDate?: string;
      };
    }>;
  };

  const shipment = data.ShipmentData?.[0]?.Shipment;
  if (!shipment) return null;

  const events = parseScans(shipment.Scans);
  const topStatus = shipment.Status;
  const latest = events[events.length - 1];
  const status: ShipmentStatus = topStatus?.Status || topStatus?.StatusType
    ? mapStatus(topStatus.StatusType, topStatus.Status)
    : latest
      ? latest.status
      : "unknown";

  return {
    carrier: "delhivery",
    trackingNumber: cleaned,
    status,
    estimatedDelivery: shipment.ExpectedDeliveryDate || undefined,
    origin: shipment.Origin || undefined,
    destination: shipment.Destination || undefined,
    events,
    fetchedAt: new Date().toISOString(),
    raw: { source: "account-api", statusType: topStatus?.StatusType ?? null },
  };
}

// ---------------------------------------------------------------------------
// Source 2: credential-free endpoint behind Delhivery's public track page
// ---------------------------------------------------------------------------

interface PublicScan {
  scanDate?: string;
  scanDateTime?: string;
  scanNslRemark?: string;
  cityLocation?: string;
  scanType?: string;
  scan?: string;
  scannedLocation?: string;
}

interface PublicState {
  label?: string;
  date?: string;
  scanDateTime?: string;
  scans?: PublicScan[];
}

interface PublicShipment {
  awb?: string;
  status?: { status?: string; statusDateTime?: string; statusType?: string; instructions?: string };
  trackingStates?: PublicState[];
  destination?: string;
  deliveryDate?: string;
  promiseDeliveryDate?: string;
}

function parsePublicEvents(d: PublicShipment): TrackingEvent[] {
  const events: TrackingEvent[] = [];

  // trackingStates groups scans by state label, oldest state first. The scans
  // themselves usually carry no date on this feed; keep them anyway for the
  // location and remark, with an empty timestamp the UI renders as blank.
  for (const state of d.trackingStates ?? []) {
    for (const sc of state.scans ?? []) {
      const description = sc.scanNslRemark || sc.scan;
      if (!description) continue;
      events.push({
        timestamp: sc.scanDateTime || sc.scanDate || state.scanDateTime || state.date || "",
        status: mapStatus(sc.scanType, sc.scan),
        location: sc.scannedLocation || sc.cityLocation || undefined,
        description,
        rawCode: sc.scanType || undefined,
      });
    }
  }

  // `status` is the current state and the one field this feed reliably dates,
  // so it becomes the newest event — unless the last scan already says exactly
  // the same thing, in which case that scan is the same event without a date.
  const st = d.status;
  const description = st?.instructions || st?.status;
  if (st?.statusDateTime && description) {
    const last = events[events.length - 1];
    if (last && last.description === description) {
      last.timestamp = st.statusDateTime;
    } else {
      // No location: the public feed gives none for the top-level status, and
      // borrowing the previous scan's would invent a position.
      events.push({
        timestamp: st.statusDateTime,
        status: mapStatus(st.statusType, st.status),
        description,
        rawCode: st.statusType || undefined,
      });
    }
  }

  return events;
}

async function trackViaPublic(cleaned: string): Promise<TrackingResult> {
  const url = `${PUBLIC_URL}?wbn=${encodeURIComponent(cleaned)}`;
  const res = await fetch(url, {
    method: "GET",
    headers: {
      "User-Agent": UA,
      Accept: "application/json",
      Origin: PUBLIC_ORIGIN,
      Referer: `${PUBLIC_ORIGIN}/tracking`,
    },
    cache: "no-store",
  });

  if (res.status === 429) throw new CarrierError("Delhivery rate-limited", "rate_limited", 429);
  // 400 is Delhivery's own format rejection; our regex is looser than theirs, so
  // read it as "no such shipment" rather than an upstream failure.
  if (!res.ok && res.status !== 400) {
    throw new CarrierError(`Delhivery upstream error (${res.status})`, "upstream_error", 502);
  }

  const body = (await res.json().catch(() => null)) as
    | { statusCode?: number; message?: string; data?: PublicShipment[] }
    | null;

  if (!body) throw new CarrierError("Delhivery returned an unreadable response.", "upstream_error", 502);
  if (res.status === 400 || body.statusCode === 400) {
    throw new CarrierError("Tracking number not found", "not_found", 404);
  }

  // Unknown or aged-out AWBs come back 200 with an empty data array.
  const d = body.data?.[0];
  if (!d) throw new CarrierError("Tracking number not found", "not_found", 404);

  const events = parsePublicEvents(d);
  const latest = events[events.length - 1];

  return {
    carrier: "delhivery",
    trackingNumber: cleaned,
    status: latest ? latest.status : mapStatus(d.status?.statusType, d.status?.status),
    // deliveryDate is the human string their page shows ("12 Sep 2026, Evening");
    // promiseDeliveryDate is the ISO backstop.
    estimatedDelivery: d.deliveryDate || d.promiseDeliveryDate || undefined,
    // The public feed exposes no origin, only a destination.
    destination: d.destination || undefined,
    events,
    fetchedAt: new Date().toISOString(),
    raw: { source: "public", statusType: d.status?.statusType ?? null, message: body.message ?? null },
  };
}

export const delhivery: Carrier = {
  id: "delhivery",
  name: "Delhivery",
  async track(trackingNumber: string, opts?: TrackOptions): Promise<TrackingResult> {
    const cleaned = trackingNumber.trim();
    if (!/^[0-9]{8,20}$/.test(cleaned)) {
      throw new CarrierError("Invalid Delhivery waybill format.", "invalid_input", 400);
    }

    const token = opts?.delhiveryToken;
    if (token) {
      try {
        const viaToken = await trackViaToken(cleaned, token);
        if (viaToken) return viaToken;
      } catch {
        // Account API unavailable (rate limit, outage, bad token). The public
        // feed is a strictly better answer than failing the request.
      }
    }

    return trackViaPublic(cleaned);
  },
};
