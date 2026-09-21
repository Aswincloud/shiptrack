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

export interface CarrierOption {
  id: string;
  name: string;
  privateOnly?: boolean;
}
