"use client";

import { useState } from "react";
import type { TrackingResult } from "@/carriers/types";

export default function Home() {
  const [carrier, setCarrier] = useState("bluedart");
  const [tracking, setTracking] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<TrackingResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!tracking.trim()) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch(`/api/track/${encodeURIComponent(carrier)}/${encodeURIComponent(tracking.trim())}`);
      const body = await res.json();
      if (!res.ok) {
        setError(body.message ?? body.error ?? "Request failed");
      } else {
        setResult(body);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main style={{ maxWidth: 720, margin: "0 auto", padding: "48px 20px" }}>
      <h1 style={{ fontSize: 28, fontWeight: 700, marginBottom: 4 }}>ShipTrack</h1>
      <p style={{ color: "var(--muted)", margin: "0 0 32px" }}>
        Free, open-source shipment tracking. Currently supports Blue Dart.
      </p>

      <form
        onSubmit={handleSubmit}
        style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 24 }}
      >
        <select
          value={carrier}
          onChange={(e) => setCarrier(e.target.value)}
          style={inputStyle}
        >
          <option value="bluedart">Blue Dart</option>
        </select>
        <input
          value={tracking}
          onChange={(e) => setTracking(e.target.value)}
          placeholder="Tracking / AWB number"
          style={{ ...inputStyle, flex: 1, minWidth: 200 }}
        />
        <button type="submit" disabled={loading || !tracking.trim()} style={buttonStyle}>
          {loading ? "Tracking…" : "Track"}
        </button>
      </form>

      {error && (
        <div style={{ ...cardStyle, borderColor: "#5a2a2a", color: "#ff9b9b" }}>
          {error}
        </div>
      )}

      {result && (
        <>
          <div style={cardStyle}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 12 }}>
              <strong>{result.trackingNumber}</strong>
              <span style={{ color: "var(--muted)" }}>{result.status.replace(/_/g, " ")}</span>
            </div>
            {result.origin && result.destination && (
              <div style={{ color: "var(--muted)", marginBottom: 16, fontSize: 14 }}>
                {result.origin} → {result.destination}
              </div>
            )}
            <ol style={{ margin: 0, padding: 0, listStyle: "none" }}>
              {result.events.slice().reverse().map((ev, i) => (
                <li
                  key={i}
                  style={{
                    padding: "10px 0",
                    borderTop: i === 0 ? "none" : "1px solid var(--border)",
                  }}
                >
                  <div style={{ fontSize: 14 }}>{ev.description}</div>
                  <div style={{ color: "var(--muted)", fontSize: 12, marginTop: 2 }}>
                    {ev.timestamp}{ev.location ? ` · ${ev.location}` : ""}
                  </div>
                </li>
              ))}
            </ol>
          </div>
          <NotifyForm carrier={carrier} trackingNumber={result.trackingNumber} />
        </>
      )}

      <footer style={{ marginTop: 48, color: "var(--muted)", fontSize: 13 }}>
        <a href="https://github.com/aswin/shiptrack">Source on GitHub</a> · MIT licensed
      </footer>
    </main>
  );
}

function NotifyForm({ carrier, trackingNumber }: { carrier: string; trackingNumber: string }) {
  const [email, setEmail] = useState("");
  const [label, setLabel] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    setLoading(true);
    setMessage(null);
    try {
      const res = await fetch("/api/watches", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email: email.trim(),
          carrier,
          trackingNumber,
          label: label.trim() || undefined,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMessage({ kind: "err", text: body.message ?? body.error ?? "Failed to register" });
      } else {
        setMessage({ kind: "ok", text: "Check your inbox for a confirmation link." });
        setEmail("");
        setLabel("");
      }
    } catch {
      setMessage({ kind: "err", text: "Network error" });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ ...cardStyle, marginTop: 16 }}>
      <h3 style={{ margin: "0 0 4px", fontSize: 16 }}>Get email alerts</h3>
      <p style={{ margin: "0 0 12px", color: "var(--muted)", fontSize: 13 }}>
        We'll email you whenever this shipment's status changes.
      </p>
      <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          style={inputStyle}
        />
        <input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="Label (optional, e.g. 'Mom's package')"
          style={inputStyle}
          maxLength={80}
        />
        <button type="submit" disabled={loading || !email.trim()} style={buttonStyle}>
          {loading ? "Sending…" : "Notify me"}
        </button>
      </form>
      {message && (
        <div
          style={{
            marginTop: 12,
            fontSize: 13,
            color: message.kind === "ok" ? "#7fd49b" : "#ff9b9b",
          }}
        >
          {message.text}
        </div>
      )}
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  background: "var(--card)",
  color: "var(--fg)",
  border: "1px solid var(--border)",
  borderRadius: 8,
  padding: "10px 12px",
  fontSize: 14,
};

const buttonStyle: React.CSSProperties = {
  background: "var(--accent)",
  color: "#fff",
  border: "none",
  borderRadius: 8,
  padding: "10px 18px",
  fontSize: 14,
  fontWeight: 500,
  cursor: "pointer",
};

const cardStyle: React.CSSProperties = {
  background: "var(--card)",
  border: "1px solid var(--border)",
  borderRadius: 12,
  padding: 20,
};
