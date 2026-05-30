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
