export type ShipmentStatus =
  | "pending"
  | "picked_up"
  | "in_transit"
  | "out_for_delivery"
  | "delivered"
  | "exception"
  | "returned"
  | "unknown";

export interface TrackingEvent {
  timestamp: string;
  status: ShipmentStatus;
  location?: string;
  description: string;
  rawCode?: string;
}

export interface TrackingResult {
  carrier: string;
  trackingNumber: string;
  status: ShipmentStatus;
  estimatedDelivery?: string;
  origin?: string;
  destination?: string;
  events: TrackingEvent[];
  fetchedAt: string;
  raw?: unknown;
}

// Per-request options passed to a carrier. Most carriers ignore this; carriers
// that need credentials (e.g. Delhivery's token-gated API) read them here so
// the carrier modules stay free of any environment/Cloudflare coupling.
export interface TrackOptions {
  delhiveryToken?: string;
  // TPC's feed only answers Indian ISP networks, not Cloudflare. When set, the
  // TPC carrier fetches through this relay (a small service on an Indian host,
  // see the comment in tpc.ts) instead of calling TPC directly.
  tpcRelayUrl?: string;
  tpcRelaySecret?: string;
}

// Build the per-request carrier options from an environment. Every caller of
// Carrier.track() (track page, track API, poller) goes through this, so a new
// carrier credential is added in one place.
export function trackOptionsFromEnv(env: {
  DELHIVERY_API_TOKEN?: string;
  TPC_RELAY_URL?: string;
  TPC_RELAY_SECRET?: string;
} | null | undefined): TrackOptions {
  return {
    delhiveryToken: env?.DELHIVERY_API_TOKEN,
    tpcRelayUrl: env?.TPC_RELAY_URL,
    tpcRelaySecret: env?.TPC_RELAY_SECRET,
  };
}

export interface Carrier {
  id: string;
  name: string;
  // Set when the carrier can only track shipments booked under the operator's
  // own account (not arbitrary public AWBs). Surfaced in the UI as a note.
  privateOnly?: boolean;
  track(trackingNumber: string, opts?: TrackOptions): Promise<TrackingResult>;
}

export class CarrierError extends Error {
  constructor(
    message: string,
    public readonly code: "not_configured" | "not_found" | "rate_limited" | "upstream_error" | "invalid_input",
    public readonly status: number = 500,
  ) {
    super(message);
    this.name = "CarrierError";
  }
}
