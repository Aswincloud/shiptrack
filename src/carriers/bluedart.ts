import { Carrier, CarrierError, ShipmentStatus, TrackingEvent, TrackingResult } from "./types";

const BLUEDART_HOSTS = {
  prod: "https://apigateway.bluedart.com",
  staging: "https://apigateway-sandbox.bluedart.com",
} as const;

function mapStatus(scanCode: string | undefined, scanType: string | undefined): ShipmentStatus {
  const code = (scanCode ?? "").toUpperCase();
  const type = (scanType ?? "").toUpperCase();
  if (type === "DL" || code === "DELIVERED") return "delivered";
  if (code === "OFD" || type === "OFD") return "out_for_delivery";
  if (code === "PU" || code === "PICKEDUP") return "picked_up";
  if (code === "RTO" || type === "RT") return "returned";
  if (code.startsWith("EX") || type === "EX") return "exception";
  if (code === "IT" || type === "UD") return "in_transit";
  return "unknown";
}

async function getJwt(licenseKey: string, loginId: string, apiKey: string, host: string): Promise<string> {
  const url = `${host}/in/transportation/token/v1/login`;
  const res = await fetch(url, {
    method: "GET",
    headers: {
      ClientID: loginId,
      "api-key": apiKey,
      LicenseKey: licenseKey,
      Accept: "application/json",
    },
    cache: "no-store",
  });
  if (!res.ok) {
    throw new CarrierError(`Blue Dart auth failed (${res.status})`, "upstream_error", 502);
  }
  const body = (await res.json()) as { JWTToken?: string };
  if (!body.JWTToken) throw new CarrierError("Blue Dart auth: no token", "upstream_error", 502);
  return body.JWTToken;
}

export const bluedart: Carrier = {
  id: "bluedart",
  name: "Blue Dart",
  async track(trackingNumber: string): Promise<TrackingResult> {
    const licenseKey = process.env.BLUEDART_LICENSE_KEY;
    const loginId = process.env.BLUEDART_LOGIN_ID;
    const apiKey = process.env.BLUEDART_API_KEY;
    const env = (process.env.BLUEDART_ENV === "prod" ? "prod" : "staging") as keyof typeof BLUEDART_HOSTS;
    const host = BLUEDART_HOSTS[env];

    if (!licenseKey || !loginId || !apiKey) {
      throw new CarrierError(
        "Blue Dart credentials not configured. Set BLUEDART_LICENSE_KEY, BLUEDART_LOGIN_ID, BLUEDART_API_KEY.",
        "not_configured",
        503,
      );
    }

    const cleaned = trackingNumber.trim();
    if (!/^[A-Za-z0-9-]{6,20}$/.test(cleaned)) {
      throw new CarrierError("Invalid Blue Dart tracking number format.", "invalid_input", 400);
    }

    const jwt = await getJwt(licenseKey, loginId, apiKey, host);
    const url = `${host}/in/transportation/tracking/v1/shipment?handler=tnt&loginid=${encodeURIComponent(loginId)}&awbno=${encodeURIComponent(cleaned)}&format=json&lickey=${encodeURIComponent(licenseKey)}&verno=1.3&scan=Y`;

    const res = await fetch(url, {
      method: "GET",
      headers: { JWTToken: jwt, Accept: "application/json" },
      cache: "no-store",
    });

    if (res.status === 429) throw new CarrierError("Blue Dart rate-limited", "rate_limited", 429);
    if (res.status === 404) throw new CarrierError("Tracking number not found", "not_found", 404);
    if (!res.ok) throw new CarrierError(`Blue Dart upstream error (${res.status})`, "upstream_error", 502);

    const raw = await res.json();
    const shipment = (raw as { ShipmentData?: unknown[] })?.ShipmentData?.[0] as
      | { Shipment?: Record<string, unknown>; Scans?: Array<Record<string, unknown>> }
      | undefined;
    const head = shipment?.Shipment ?? {};
    const scans = shipment?.Scans ?? [];

    const events: TrackingEvent[] = scans.map((s) => {
      const code = (s.ScanCode as string) ?? undefined;
      const type = (s.ScanType as string) ?? undefined;
      return {
        timestamp: `${s.ScanDate ?? ""}T${s.ScanTime ?? "00:00:00"}`,
        status: mapStatus(code, type),
        location: (s.ScannedLocation as string) ?? undefined,
        description: (s.Scan as string) ?? "",
        rawCode: code,
      };
    });

    const latest = events[events.length - 1];

    return {
      carrier: "bluedart",
      trackingNumber: cleaned,
      status: latest?.status ?? "unknown",
      estimatedDelivery: (head.ExpectedDeliveryDate as string) ?? undefined,
      origin: (head.Origin as string) ?? undefined,
      destination: (head.Destination as string) ?? undefined,
      events,
      fetchedAt: new Date().toISOString(),
      raw,
    };
  },
};
