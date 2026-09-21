import type { Metadata } from "next";
import { cache } from "react";
import Link from "next/link";
import { getCarrier } from "@/carriers/registry";
import { CarrierError, type TrackingResult } from "@/carriers/types";
import { getEnvAsync } from "@/lib/env";
import { humanStatus } from "@/lib/status";
import { Timeline } from "@/app/components/Timeline";
import { ShareButton } from "@/app/components/ShareButton";
import { CopyButton } from "@/app/components/CopyButton";
import { cardStyle, statusPillStyle, buttonStyle } from "@/app/styles";

export const dynamic = "force-dynamic";

interface Params {
  carrier: string;
  tracking: string;
}

// One carrier lookup per request, shared between generateMetadata and the page
// body. React's cache() is request-scoped in the App Router, so the share
// preview can carry the live status without hitting the carrier twice.
const lookup = cache(
  async (carrierId: string, tracking: string): Promise<{ result: TrackingResult | null; error: string | null }> => {
    const carrier = getCarrier(carrierId);
    if (!carrier) return { result: null, error: "unknown_carrier" };
    const env = await getEnvAsync();
    try {
      return { result: await carrier.track(tracking, { delhiveryToken: env?.DELHIVERY_API_TOKEN }), error: null };
    } catch (err) {
      return { result: null, error: err instanceof CarrierError ? err.code : "error" };
    }
  },
);

const OG_IMAGE = {
  url: "/opengraph-image.png",
  width: 1200,
  height: 630,
  alt: "ShipTrack — free courier tracking for India with email alerts",
};

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { carrier: carrierId, tracking } = await params;
  const carrierName = getCarrier(carrierId)?.name ?? carrierId;
  const { result } = await lookup(carrierId, tracking);
  const path = `/track/${carrierId}/${tracking}`;

  const status = result ? humanStatus(result.status) : null;
  const title = status ? `${tracking} · ${status}` : `Track ${tracking} (${carrierName})`;

  let description = `Live tracking status and scan history for ${carrierName} shipment ${tracking}.`;
  if (result) {
    const latest = result.events[result.events.length - 1];
    const parts = [`${carrierName} · ${status}`];
    if (latest) {
      parts.push(
        [latest.description, latest.location, latest.timestamp].filter(Boolean).join(" · "),
      );
    }
    if (result.estimatedDelivery) parts.push(`Expected delivery ${result.estimatedDelivery}`);
    description = parts.join(". ") + ".";
  }

  return {
    title,
    description,
    alternates: { canonical: path },
    robots: { index: false, follow: true },
    // Setting openGraph here replaces the root object wholesale, so the
    // file-convention image has to be re-attached explicitly.
    openGraph: { type: "website", url: path, siteName: "ShipTrack", title, description, images: [OG_IMAGE] },
    twitter: { card: "summary_large_image", title, description, images: [OG_IMAGE.url] },
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

  const { result, error } = await lookup(carrierId, tracking);
  const errorMsg: string | null = !error
    ? null
    : error === "not_found"
      ? "No tracking information found for this shipment."
      : "Couldn't load tracking right now. Try again shortly.";

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
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontFamily: "ui-monospace, monospace", fontSize: 18, fontWeight: 600 }}>
                    {result.trackingNumber}
                  </span>
                  <CopyButton value={result.trackingNumber} />
                </div>
              </div>
              <span style={statusPillStyle(result.status)}>{humanStatus(result.status)}</span>
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
                text={`Tracking ${carrier.name} shipment ${result.trackingNumber} — ${humanStatus(result.status)}`}
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
