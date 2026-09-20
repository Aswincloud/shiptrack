import { Carrier, CarrierError, ShipmentStatus, TrackingEvent, TrackingResult } from "./types";

// Amazon Shipping (India) — track.amazon.in. No credentials. The public tracker
// SPA loads `GET /api/tracker/<id>` (the same call this carrier makes). Nested
// fields (`progressTracker`, `eventHistory`) arrive as JSON *strings*.
//
// CSRF: the SPA copies <meta name="CSRF-TOKEN"> into `anti-csrftoken-a2z`. As of
// Sep 2026 the GET works without that header; we still send a browser UA.
//
// Not-found is HTTP 200 with:
//   progressTracker.errors[].errorCode === "TRACKING_ID_NOT_FOUND"
//
// IDs on this site are numeric (typically 12 digits). This is Amazon Shipping
// as a courier (AMZL / SWA), not an Amazon.in order ID.

const TRACK_URL = "https://track.amazon.in/api/tracker";
const UA =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

const EVENT_DESCRIPTIONS: Record<string, string> = {
  CreationConfirmed: "Shipping label created",
  PickupDone: "Picked up",
  Received: "Arrived at facility",
  Departed: "Departed facility",
  OutForDelivery: "Out for delivery",
  Delivered: "Delivered",
  DeliveryAttempted: "Delivery attempted",
  Rejected: "Delivery rejected",
  Undeliverable: "Undeliverable",
  Returned: "Returned",
  ReturnInitiated: "Return initiated",
  HoldForPickup: "Held for pickup",
};

function parseNested<T>(value: unknown): T | null {
  if (value == null) return null;
  if (typeof value === "object") return value as T;
  if (typeof value === "string") {
    try {
      return JSON.parse(value) as T;
    } catch {
      return null;
    }
  }
  return null;
}

function mapTrackingStatus(code: string | undefined): ShipmentStatus | undefined {
  const t = (code ?? "").toUpperCase();
  if (!t) return undefined;
  if (t === "DELIVERED") return "delivered";
  if (t === "OUT_FOR_DELIVERY" || t === "OFD") return "out_for_delivery";
  if (t === "RETURNED" || t === "RETURNING" || t === "RTO") return "returned";
  if (t === "EXCEPTION" || t === "UNDELIVERABLE" || t === "HOLD_FOR_PICKUP") return "exception";
  if (t === "PICKED_UP" || t === "PICKUP_DONE") return "picked_up";
  if (t === "IN_TRANSIT" || t === "INTRANSIT") return "in_transit";
  if (t === "PENDING" || t === "CREATED" || t === "LABEL_CREATED") return "pending";
  return undefined;
}

function mapEventCode(code: string | undefined): ShipmentStatus {
  const t = (code ?? "").toLowerCase();
  if (!t) return "unknown";
  if (t.includes("return")) return "returned";
  if (t.includes("undeliver") || t.includes("reject") || t.includes("attempt") || t.includes("hold")) {
    return "exception";
  }
  if (t.includes("deliver") && !t.includes("ofd")) return "delivered";
  if (t.includes("outfordelivery") || t === "ofd" || t.includes("out_for_delivery")) return "out_for_delivery";
  if (t.includes("pickup") || t === "pickupdone") return "picked_up";
  if (
    t.includes("received") ||
    t.includes("departed") ||
    t.includes("transit") ||
    t.includes("arrived") ||
    t.includes("facility")
  ) {
    return "in_transit";
  }
  if (t.includes("creation") || t.includes("label") || t.includes("pending")) return "pending";
  return "unknown";
}

function titleFromCode(code: string): string {
  if (EVENT_DESCRIPTIONS[code]) return EVENT_DESCRIPTIONS[code];
  const spaced = code.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/_/g, " ");
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

function formatLocation(loc: { city?: string; stateProvince?: string; postalCode?: string } | undefined): string | undefined {
  if (!loc) return undefined;
  const parts = [loc.city, loc.stateProvince, loc.postalCode].filter((p) => p && p.trim());
  return parts.length ? parts.join(", ") : undefined;
}

interface AmazonEvent {
  eventCode?: string;
  eventTime?: string;
  location?: { city?: string; stateProvince?: string; countryCode?: string; postalCode?: string };
  statusSummary?: { localisedStringId?: string };
}

interface ProgressTracker {
  errors?: Array<{ errorCode?: string; errorMessage?: string }>;
  summary?: {
    status?: string | null;
    metadata?: {
      trackingStatus?: { stringValue?: string };
      expectedDeliveryDate?: { date?: string };
      promisedDeliveryDate?: { date?: string };
      shipperName?: { stringValue?: string };
    };
  };
  progressMeter?: {
    milestoneList?: Array<{
      isActive?: boolean;
      eventSummary?: { timeElement?: string; statusElement?: { translatorString?: { localisedStringId?: string } } };
    }>;
  };
}

interface EventHistoryEnvelope {
  eventHistory?: AmazonEvent[];
}

function parseEvents(history: AmazonEvent[] | undefined): TrackingEvent[] {
  if (!Array.isArray(history)) return [];
  const events: TrackingEvent[] = [];
  for (const ev of history) {
    const code = ev.eventCode ?? "";
    const description = titleFromCode(code);
    if (!description) continue;
    events.push({
      timestamp: ev.eventTime ?? "",
      status: mapEventCode(code),
      location: formatLocation(ev.location),
      description,
      rawCode: code || ev.statusSummary?.localisedStringId || undefined,
    });
  }
  // Feed is oldest-first in samples; sort when every timestamp parses so the
  // poller's last-event hash still points at the newest scan.
  const times = events.map((e) => Date.parse(e.timestamp));
  if (times.every((t) => Number.isFinite(t))) {
    return events
      .map((e, i) => ({ e, t: times[i] }))
      .sort((a, b) => a.t - b.t)
      .map(({ e }) => e);
  }
  return events;
}

export const amazon: Carrier = {
  id: "amazon",
  name: "Amazon Shipping",
  async track(trackingNumber: string): Promise<TrackingResult> {
    const cleaned = trackingNumber.trim();
    if (!/^[0-9]{10,18}$/.test(cleaned)) {
      throw new CarrierError("Invalid Amazon Shipping tracking ID format.", "invalid_input", 400);
    }

    const url = `${TRACK_URL}/${encodeURIComponent(cleaned)}`;
    const res = await fetch(url, {
      method: "GET",
      headers: {
        "User-Agent": UA,
        Accept: "application/json",
        Referer: `https://track.amazon.in/tracking/${cleaned}`,
      },
      cache: "no-store",
    });

    if (res.status === 429) throw new CarrierError("Amazon Shipping rate-limited", "rate_limited", 429);
    if (!res.ok) throw new CarrierError(`Amazon Shipping upstream error (${res.status})`, "upstream_error", 502);

    const data = (await res.json().catch(() => null)) as {
      progressTracker?: unknown;
      eventHistory?: unknown;
      shipperDetails?: { shipperName?: string };
    } | null;

    if (!data) throw new CarrierError("Amazon Shipping returned an unreadable response.", "upstream_error", 502);

    const tracker = parseNested<ProgressTracker>(data.progressTracker);
    const errors = tracker?.errors ?? [];
    if (errors.some((e) => (e.errorCode ?? "").toUpperCase() === "TRACKING_ID_NOT_FOUND")) {
      throw new CarrierError("Tracking number not found", "not_found", 404);
    }

    const history = parseNested<EventHistoryEnvelope>(data.eventHistory);
    const events = parseEvents(history?.eventHistory);
    const latest = events[events.length - 1];
    const meta = tracker?.summary?.metadata;
    const status =
      mapTrackingStatus(meta?.trackingStatus?.stringValue) ??
      mapEventCode(tracker?.summary?.status ?? undefined) ??
      latest?.status ??
      "unknown";

    if (!latest && status === "unknown") {
      throw new CarrierError("Tracking number not found", "not_found", 404);
    }

    const origin = events.find((e) => e.location)?.location;

    return {
      carrier: "amazon",
      trackingNumber: cleaned,
      status,
      estimatedDelivery: meta?.expectedDeliveryDate?.date || meta?.promisedDeliveryDate?.date || undefined,
      origin,
      events,
      fetchedAt: new Date().toISOString(),
      raw: {
        source: "track.amazon.in",
        summaryStatus: tracker?.summary?.status ?? null,
        trackingStatus: meta?.trackingStatus?.stringValue ?? null,
        shipper: data.shipperDetails?.shipperName ?? meta?.shipperName?.stringValue ?? null,
      },
    };
  },
};
