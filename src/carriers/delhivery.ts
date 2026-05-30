import {
  Carrier,
  CarrierError,
  ShipmentStatus,
  TrackingEvent,
  TrackingResult,
  TrackOptions,
} from "./types";

// Delhivery's tracking API is token-gated and only returns shipments booked
// under the operator's own Delhivery account — there is no credential-free
// public endpoint (the public track page mints a short-lived runtime token we
// can't reliably replicate). So this carrier is `privateOnly`: it works for the
// operator's own AWBs and returns not_found for anyone else's.
//
// Docs: https://track.delhivery.com/api/v1/packages/json/?token=<TOKEN>&waybill=<AWB>&verbose=2
// Success envelope:
//   { ShipmentData: [ { Shipment: {
//       Status: { Status, StatusDateTime, StatusLocation, Instructions },
//       Scans: [ { ScanDetail: { Scan, ScanDateTime, ScannedLocation, Instructions, StatusCode } } ],
//       Origin, Destination, ExpectedDeliveryDate, ... } } ] }
// Not-found envelope:
//   { Success: false, Error: "No such waybill or Order Id found" }

const TRACK_URL = "https://track.delhivery.com/api/v1/packages/json/";
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

export const delhivery: Carrier = {
  id: "delhivery",
  name: "Delhivery",
  privateOnly: true,
  async track(trackingNumber: string, opts?: TrackOptions): Promise<TrackingResult> {
    const cleaned = trackingNumber.trim();
    if (!/^[0-9]{8,20}$/.test(cleaned)) {
      throw new CarrierError("Invalid Delhivery waybill format.", "invalid_input", 400);
    }
    const token = opts?.delhiveryToken;
    if (!token) {
      throw new CarrierError("Delhivery tracking is not configured.", "not_configured", 503);
    }

    const url = `${TRACK_URL}?waybill=${encodeURIComponent(cleaned)}&verbose=2`;
    const res = await fetch(url, {
      method: "GET",
      headers: { "User-Agent": UA, Accept: "application/json", Authorization: `Token ${token}` },
      cache: "no-store",
    });

    if (res.status === 401 || res.status === 403) {
      throw new CarrierError("Delhivery rejected the API token.", "not_configured", 503);
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
    if (!shipment) {
      // Either an explicit not-found, or this AWB isn't under our account.
      throw new CarrierError("Tracking number not found", "not_found", 404);
    }

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
      raw: { source: "api", statusType: topStatus?.StatusType ?? null },
    };
  },
};
