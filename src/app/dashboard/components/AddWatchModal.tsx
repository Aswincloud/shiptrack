"use client";

import { useState, useEffect } from "react";
import { inputStyle, buttonStyle, buttonGhostStyle, cardStyle } from "../../styles";
import { IntervalPicker } from "../../components/IntervalPicker";
import type { ClientWatch, CarrierOption } from "./types";

// Quick "watch an AWB" modal — lets the owner pre-register a tracking number
// straight from the dashboard, without first running a track on the homepage.
// Works for not-yet-ingested AWBs: the poller retries until the carrier has it.
const ADD_DEFAULT_INTERVAL = 15 * 60;

export function AddWatchModal({
  defaultEmail,
  onClose,
  onAdded,
}: {
  defaultEmail: string;
  onClose: () => void;
  onAdded: (w: ClientWatch) => void;
}) {
  const [carriers, setCarriers] = useState<CarrierOption[]>([]);
  const [carrier, setCarrier] = useState("bluedart");
  const [tracking, setTracking] = useState("");
  const [label, setLabel] = useState("");
  const [email, setEmail] = useState(defaultEmail);
  const [interval, setIntervalState] = useState<number>(ADD_DEFAULT_INTERVAL);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/carriers")
      .then((r) => r.json())
      .then((b: { carriers: CarrierOption[] }) => {
        if (b.carriers?.length) {
          setCarriers(b.carriers);
          setCarrier((c) => (b.carriers.some((x) => x.id === c) ? c : b.carriers[0].id));
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const selected = carriers.find((c) => c.id === carrier);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const tr = tracking.trim();
    if (!tr || !email.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/watches", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email.trim(),
          carrier,
          trackingNumber: tr,
          label: label.trim() || undefined,
          pollIntervalSeconds: interval,
        }),
      });
      const body = await res.json();
      if (!res.ok) {
        setError(body.message ?? body.error ?? "Couldn't add watch.");
        return;
      }
      // POST returns {status, id} — build the row optimistically. It starts with
      // no scan yet, so the dashboard shows "awaiting first scan" (or "awaiting
      // confirmation" when the notify address isn't the account's own).
      onAdded({
        id: body.id,
        email: email.trim(),
        carrier,
        trackingNumber: tr,
        label: label.trim() || null,
        status: body.status === "pending_confirmation" ? "pending" : "active",
        lastKnownStatus: null,
        estimatedDelivery: null,
        lastPolledAt: null,
        createdAt: Math.floor(Date.now() / 1000),
        completedAt: null,
        pollIntervalSeconds: interval,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error");
    } finally {
      setSubmitting(false);
    }
  }

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
        style={{ ...cardStyle, maxWidth: 480, width: "100%", marginTop: 40, padding: 0, overflow: "hidden" }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, padding: "18px 24px", borderBottom: "1px solid var(--border)" }}>
          <div style={{ fontWeight: 600, fontSize: 16 }}>Watch an AWB</div>
          <button type="button" onClick={onClose} aria-label="Close" style={{ ...buttonGhostStyle, padding: "4px 10px", fontSize: 18, lineHeight: 1 }}>×</button>
        </div>
        <form onSubmit={submit} style={{ padding: "20px 24px", display: "flex", flexDirection: "column", gap: 14 }}>
          <label style={addLabel}>
            Carrier
            <select value={carrier} onChange={(e) => setCarrier(e.target.value)} style={inputStyle}>
              {carriers.length === 0 ? (
                <option value="bluedart">Blue Dart</option>
              ) : (
                carriers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))
              )}
            </select>
          </label>
          {selected?.privateOnly && (
            <div style={{ fontSize: 12, color: "var(--warning)", marginTop: -6 }}>
              {selected.name} only resolves shipments booked under our own account — a random
              AWB will stay &ldquo;awaiting first scan&rdquo; indefinitely.
            </div>
          )}
          <label style={addLabel}>
            Tracking / AWB number
            <input
              value={tracking}
              onChange={(e) => setTracking(e.target.value)}
              placeholder="Enter AWB number"
              required
              style={inputStyle}
            />
          </label>
          <label style={addLabel}>
            Label <span style={{ color: "var(--muted-soft)", fontWeight: 400 }}>(optional)</span>
            <input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="e.g. Phone case from Amazon"
              maxLength={80}
              style={inputStyle}
            />
          </label>
          <label style={addLabel}>
            Notify email
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              style={inputStyle}
            />
          </label>
          <label style={addLabel}>
            Check every
            <IntervalPicker value={interval} onChange={setIntervalState} style={{ width: "100%" }} />
          </label>
          {error && <div style={{ fontSize: 13, color: "var(--danger)" }}>{error}</div>}
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 4 }}>
            <button type="button" onClick={onClose} style={{ ...buttonGhostStyle, padding: "9px 16px", fontSize: 14 }}>
              Cancel
            </button>
            <button type="submit" disabled={submitting || !tracking.trim() || !email.trim()} style={{ ...buttonStyle, padding: "9px 18px", fontSize: 14 }}>
              {submitting ? "Adding…" : "Add watch"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

const addLabel: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 6,
  fontSize: 13,
  fontWeight: 600,
  color: "var(--fg-soft)",
};
