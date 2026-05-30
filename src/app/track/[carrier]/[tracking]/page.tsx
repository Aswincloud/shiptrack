import type { Metadata } from "next";
import Link from "next/link";
import { getCarrier } from "@/carriers/registry";
import { CarrierError } from "@/carriers/types";
import { getEnvAsync } from "@/lib/env";
import { Timeline } from "@/app/components/Timeline";
import { ShareButton } from "@/app/components/ShareButton";
import { cardStyle, statusPillStyle, buttonStyle } from "@/app/styles";

export const dynamic = "force-dynamic";

interface Params {
  carrier: string;
  tracking: string;
}

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { carrier, tracking } = await params;
  const title = `Track ${tracking} (${carrier})`;
  return {
    title,
    description: `Live tracking status and scan history for ${carrier} shipment ${tracking}.`,
    alternates: { canonical: `/track/${carrier}/${tracking}` },
    robots: { index: false, follow: true },
  };
}

export default async function PublicTrackPage({ params }: { params: Promise<Params> }) {
  const { carrier: carrierId, tracking } = await params;
  const carrier = getCarrier(carrierId);

  if (!carrier) {
    return (
      <Shell>
        <div style={{ ...cardStyle, textAlign: "center", padding: "40px 24px" }}>
          <div style={{ fontSize: 28, marginBottom: 8 }}>🤔</div>
          <div style={{ fontWeight: 600 }}>Unknown carrier &ldquo;{carrierId}&rdquo;</div>
          <p style={{ color: "var(--muted)", fontSize: 14 }}>
            <Link href="/">Go to ShipTrack</Link> to track a different shipment.
          </p>
        </div>
      </Shell>
    );
  }

  const env = await getEnvAsync();
  let result = null;
  let errorMsg: string | null = null;
  try {
    result = await carrier.track(tracking, { delhiveryToken: env?.DELHIVERY_API_TOKEN });
  } catch (err) {
    errorMsg =
      err instanceof CarrierError && err.code === "not_found"
        ? "No tracking information found for this shipment."
        : "Couldn't load tracking right now. Try again shortly.";
  }

  return (
    <Shell>
      {errorMsg && (
        <div style={{ ...cardStyle, borderColor: "var(--danger-border)", background: "var(--danger-bg)", color: "var(--danger)", display: "flex", gap: 10, alignItems: "center" }}>
          <span aria-hidden style={{ fontSize: 16 }}>⚠</span>
          <span style={{ fontSize: 14, fontWeight: 500 }}>{errorMsg}</span>
        </div>
      )}

      {result && (
        <div style={{ ...cardStyle, padding: 0, overflow: "hidden", boxShadow: "var(--shadow-md)" }}>
          <div style={{ padding: "20px 24px", borderBottom: "1px solid var(--border)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
              <div>
                <div style={{ fontSize: 12, color: "var(--muted)", fontWeight: 500, marginBottom: 4 }}>
                  {result.carrier.toUpperCase()} · WAYBILL
                </div>
                <div style={{ fontFamily: "ui-monospace, monospace", fontSize: 18, fontWeight: 600 }}>
                  {result.trackingNumber}
                </div>
              </div>
              <span style={statusPillStyle(result.status)}>{result.status.replace(/_/g, " ")}</span>
            </div>
            {result.origin && result.destination && (
              <div style={{ marginTop: 14, display: "flex", alignItems: "center", gap: 12, fontSize: 14, color: "var(--fg-soft)" }}>
                <span style={{ fontWeight: 500 }}>{result.origin}</span>
                <span style={{ flex: 1, height: 1, background: "linear-gradient(90deg, var(--border-strong), var(--accent), var(--border-strong))" }} />
                <span style={{ fontWeight: 500 }}>{result.destination}</span>
              </div>
            )}
            {result.estimatedDelivery && (
              <div style={{ marginTop: 10, fontSize: 13, color: "var(--muted)" }}>
                Expected delivery: <strong style={{ color: "var(--fg)" }}>{result.estimatedDelivery}</strong>
              </div>
            )}
            <div style={{ marginTop: 16 }}>
              <ShareButton
                title={`Track ${result.trackingNumber}`}
                text={`Tracking ${result.carrier} shipment ${result.trackingNumber} — ${result.status.replace(/_/g, " ")}`}
              />
            </div>
          </div>
          <div style={{ padding: "8px 24px 20px" }}>
            <Timeline events={result.events} />
          </div>
        </div>
      )}

      <div style={{ marginTop: 24, textAlign: "center" }}>
        <Link href="/" style={{ ...buttonStyle, textDecoration: "none", display: "inline-block" }}>
          Track another shipment
        </Link>
      </div>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main style={{ maxWidth: 640, margin: "0 auto", padding: "48px 24px" }}>
      <h1 style={{ fontSize: 24, fontWeight: 700, letterSpacing: "-0.02em", marginBottom: 4 }}>
        Shipment tracking
      </h1>
      <p style={{ color: "var(--muted)", fontSize: 14, margin: "0 0 24px" }}>
        Shared via <Link href="/">ShipTrack</Link>
      </p>
      {children}
    </main>
  );
}
