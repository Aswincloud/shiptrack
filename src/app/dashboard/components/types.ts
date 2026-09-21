export interface ClientWatch {
  id: string;
  email: string;
  carrier: string;
  trackingNumber: string;
  label: string | null;
  status: string;
  lastKnownStatus: string | null;
  estimatedDelivery: string | null;
  lastPolledAt: number | null;
  createdAt: number;
  completedAt: number | null;
  pollIntervalSeconds: number;
}

export interface AdminUser {
  id: string;
  email: string;
  email_verified: number;
  is_admin: number;
  created_at: number;
  watch_count: number;
  watches_created: number;
}

// A watch with no owning account: requested by a signed-out visitor from a
// track page, or registered through the ADMIN_TOKEN curl flow.
export interface AdminWatchRequest {
  id: string;
  email: string;
  carrier: string;
  tracking_number: string;
  label: string | null;
  status: string;
  last_known_status: string | null;
  created_at: number;
  confirmed_at: number | null;
  last_polled_at: number | null;
}

export interface CarrierOption {
  id: string;
  name: string;
  privateOnly?: boolean;
}
