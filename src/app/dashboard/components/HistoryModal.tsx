"use client";

import { useState, useEffect } from "react";
import type { TrackingResult } from "@/carriers/types";
import { buttonGhostStyle, cardStyle, statusPillStyle } from "../../styles";
import { Timeline } from "../../components/Timeline";
import { ShareButton } from "../../components/ShareButton";
import type { ClientWatch } from "./types";

// Fetches the carrier's live scan history on open and shows it in a modal.
// Reuses the public /api/track endpoint so it reflects the *full* trace, not
// just the change-events we stored since the watch was created.
export function HistoryModal({ watch, onClose }: { watch: ClientWatch; onClose: () => void }) {
  const [result, setResult] = useState<TrackingResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setResult(null);
    fetch(`/api/track/${encodeURIComponent(watch.carrier)}/${encodeURIComponent(watch.trackingNumber)}`)
      .then(async (res) => {
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(
            body.error === "not_found"
              ? "No tracking info found for this shipment."
              : body.message || body.error || "Couldn't load tracking.",
          );
        }
        return res.json();
      })
      .then((r: TrackingResult) => {
        if (!cancelled) setResult(r);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "Couldn't load tracking.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [watch.carrier, watch.trackingNumber]);

  // Close on Escape.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(15,23,42,0.45)",
        backdropFilter: "blur(2px)",
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "center",
        padding: "24px 16px",
        overflowY: "auto",
        zIndex: 50,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ ...cardStyle, maxWidth: 520, width: "100%", marginTop: 40, padding: 0, overflow: "hidden" }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, padding: "20px 24px", borderBottom: "1px solid var(--border)" }}>
          <div>
            <div style={{ fontWeight: 600, fontSize: 15 }}>
              <code>{watch.trackingNumber}</code>
            </div>
            <div style={{ color: "var(--muted)", fontSize: 12, marginTop: 2, textTransform: "capitalize" }}>
              {watch.carrier}
              {result && (
                <span style={{ ...statusPillStyle(result.status), marginLeft: 8, textTransform: "none" }}>
                  {result.status.replace(/_/g, " ")}
                </span>
              )}
            </div>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" style={{ ...buttonGhostStyle, padding: "4px 10px", fontSize: 18, lineHeight: 1 }}>×</button>
        </div>

        <div style={{ padding: "12px 24px 20px", maxHeight: "60vh", overflowY: "auto" }}>
          {loading && <div style={{ color: "var(--muted)", fontSize: 14, padding: "12px 0" }}>Loading tracking history…</div>}
          {error && <div style={{ color: "var(--danger)", fontSize: 14, padding: "12px 0" }}>{error}</div>}
          {result && !loading && (
            <>
              <div style={{ marginBottom: 8 }}>
                <ShareButton
                  url={`${typeof window !== "undefined" ? window.location.origin : ""}/track/${encodeURIComponent(watch.carrier)}/${encodeURIComponent(watch.trackingNumber)}`}
                  title={`Track ${watch.trackingNumber}`}
                  text={`Tracking ${watch.carrier} shipment ${watch.trackingNumber}`}
                  label="Share tracking"
                />
              </div>
              <Timeline events={result.events} />
            </>
          )}
        </div>
      </div>
    </div>
  );
}
