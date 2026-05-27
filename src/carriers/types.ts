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

export interface Carrier {
  id: string;
  name: string;
  track(trackingNumber: string): Promise<TrackingResult>;
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
