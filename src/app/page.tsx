"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { TrackingResult } from "@/carriers/types";
import { inputStyle, buttonStyle, cardStyle, statusPillStyle } from "./styles";
import { IntervalPicker } from "./components/IntervalPicker";

const DEFAULT_INTERVAL_SECONDS = 15 * 60;

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
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@graph": [
              {
                "@type": "WebApplication",
                name: "ShipTrack",
                url: "https://shiptrack.aswincloud.com",
                description:
                  "Free, open-source shipment tracking for Blue Dart with optional email alerts on status changes.",
                applicationCategory: "BusinessApplication",
                operatingSystem: "Any",
                offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
                inLanguage: "en",
              },
              {
                "@type": "Organization",
                name: "ShipTrack",
                url: "https://shiptrack.aswincloud.com",
                logo: "https://shiptrack.aswincloud.com/apple-icon.svg",
                sameAs: ["https://github.com/Aswincloud/shiptrack"],
              },
            ],
          }),
        }}
      />
      <main style={{ maxWidth: 760, margin: "0 auto", padding: "64px 24px" }}>
      <header style={{ textAlign: "center", marginBottom: 40 }}>
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            padding: "4px 12px",
            borderRadius: 999,
            background: "var(--accent-soft)",
            color: "var(--accent)",
            fontSize: 12,
            fontWeight: 600,
            marginBottom: 16,
            border: "1px solid var(--accent-soft)",
          }}
        >
          ✦ Free & open source
        </span>
        <h1
          style={{
            fontSize: 44,
            fontWeight: 800,
            margin: "0 0 12px",
            letterSpacing: "-0.03em",
            background: "linear-gradient(135deg, #0f172a 0%, #6366f1 100%)",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
            backgroundClip: "text",
            lineHeight: 1.1,
          }}
        >
          Track shipments,<br />get instant alerts
        </h1>
        <p style={{ color: "var(--muted)", margin: 0, fontSize: 16, maxWidth: 480, marginInline: "auto" }}>
          Paste a Blue Dart waybill to see live status, then opt in to email
          notifications when it changes.
        </p>
      </header>

      <form
        onSubmit={handleSubmit}
        style={{
          ...cardStyle,
          padding: 12,
          display: "flex",
          gap: 8,
          flexWrap: "wrap",
          marginBottom: 24,
          boxShadow: "var(--shadow-lg)",
        }}
      >
        <select
          value={carrier}
          onChange={(e) => setCarrier(e.target.value)}
          style={{ ...inputStyle, border: "none", background: "transparent", fontWeight: 500 }}
        >
          <option value="bluedart">Blue Dart</option>
          <option value="shiprocket">Shiprocket (any courier)</option>
        </select>
        <input
          value={tracking}
          onChange={(e) => setTracking(e.target.value)}
          placeholder="Enter tracking / AWB number"
          style={{ ...inputStyle, flex: 1, minWidth: 220, border: "none", background: "transparent", fontSize: 15 }}
        />
        <button type="submit" disabled={loading || !tracking.trim()} style={buttonStyle}>
          {loading ? "Tracking…" : "Track →"}
        </button>
      </form>

      {error && (
        <div
          style={{
            ...cardStyle,
            borderColor: "var(--danger-border)",
            background: "var(--danger-bg)",
            color: "var(--danger)",
            display: "flex",
            alignItems: "center",
            gap: 10,
          }}
        >
          <span aria-hidden style={{ fontSize: 16 }}>⚠</span>
          <span style={{ fontSize: 14, fontWeight: 500 }}>{error}</span>
        </div>
      )}

      {result && (
        <>
          <div style={{ ...cardStyle, padding: 0, overflow: "hidden", boxShadow: "var(--shadow-md)" }}>
            <div
              style={{
                padding: "20px 24px",
                background: "linear-gradient(135deg, var(--accent-soft) 0%, #faf5ff 100%)",
                borderBottom: "1px solid var(--border)",
              }}
            >
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
            </div>

            <ol style={{ margin: 0, padding: "8px 24px 20px", listStyle: "none" }}>
              {result.events.slice().reverse().map((ev, i, arr) => (
                <li key={i} style={{ position: "relative", paddingLeft: 28, paddingBlock: 14 }}>
                  <span
                    aria-hidden
                    style={{
                      position: "absolute",
                      left: 4,
                      top: 18,
                      width: 10,
                      height: 10,
                      borderRadius: "50%",
                      background: i === 0 ? "var(--accent)" : "var(--card)",
                      border: `2px solid ${i === 0 ? "var(--accent)" : "var(--border-strong)"}`,
                      boxShadow: i === 0 ? "0 0 0 4px rgba(99,102,241,0.15)" : "none",
                      zIndex: 1,
                    }}
                  />
                  {i < arr.length - 1 && (
                    <span
                      aria-hidden
                      style={{
                        position: "absolute",
                        left: 8,
                        top: 26,
                        bottom: -14,
                        width: 2,
                        background: "var(--border)",
                      }}
                    />
                  )}
                  <div style={{ fontSize: 14, fontWeight: 500, color: "var(--fg)" }}>{ev.description}</div>
                  <div style={{ color: "var(--muted)", fontSize: 12, marginTop: 4, display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <span>{ev.timestamp}</span>
                    {ev.location && (
                      <>
                        <span style={{ color: "var(--muted-soft)" }}>·</span>
                        <span>{ev.location}</span>
                      </>
                    )}
                  </div>
                </li>
              ))}
            </ol>
          </div>

          <NotifyForm carrier={carrier} trackingNumber={result.trackingNumber} />
        </>
      )}

      <footer style={{ marginTop: 64, textAlign: "center", color: "var(--muted)", fontSize: 13 }}>
        <div style={{ display: "flex", justifyContent: "center", gap: 14, flexWrap: "wrap", marginBottom: 10 }}>
          <Link href="/faq" style={{ color: "var(--muted)" }}>FAQ</Link>
          <span style={{ color: "var(--muted-soft)" }}>·</span>
          <Link href="/privacy" style={{ color: "var(--muted)" }}>Privacy</Link>
          <span style={{ color: "var(--muted-soft)" }}>·</span>
          <Link href="/terms" style={{ color: "var(--muted)" }}>Terms</Link>
          <span style={{ color: "var(--muted-soft)" }}>·</span>
          <a href="https://github.com/Aswincloud/shiptrack" style={{ color: "var(--muted)" }}>GitHub</a>
        </div>
        <div>MIT licensed · made by <a href="mailto:aswin@aswincloud.com" style={{ color: "var(--muted)" }}>Aswin</a></div>
      </footer>
    </main>
    </>
  );
}

interface Me {
  userId: string;
  email: string;
}

function NotifyForm({ carrier, trackingNumber }: { carrier: string; trackingNumber: string }) {
  const [me, setMe] = useState<Me | null | undefined>(undefined);
  const [email, setEmail] = useState("");
  const [label, setLabel] = useState("");
  const [intervalSeconds, setIntervalSeconds] = useState<number>(DEFAULT_INTERVAL_SECONDS);
  const [submitting, setSubmitting] = useState(false);
  const [status, setStatus] = useState<{ kind: "ok" | "err"; msg: string } | null>(null);

  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((b: Me | null) => {
        setMe(b);
        if (b?.email) setEmail(b.email);
      })
      .catch(() => setMe(null));
  }, []);

  async function handle(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    setSubmitting(true);
    setStatus(null);
    try {
      const res = await fetch("/api/watches", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email.trim(),
          carrier,
          trackingNumber,
          label: label.trim() || undefined,
          pollIntervalSeconds: intervalSeconds,
        }),
      });
      const body = await res.json();
      if (!res.ok) {
        setStatus({ kind: "err", msg: body.message ?? body.error ?? "Failed to register watch" });
      } else {
        setStatus({ kind: "ok", msg: `Watching. You'll get an email at ${email} on status changes.` });
        setLabel("");
      }
    } catch (err) {
      setStatus({ kind: "err", msg: err instanceof Error ? err.message : "Network error" });
    } finally {
      setSubmitting(false);
    }
  }

  if (me === undefined) return null;

  if (me === null) {
    return (
      <div
        style={{
          ...cardStyle,
          marginTop: 16,
          textAlign: "center",
          background: "linear-gradient(135deg, var(--accent-soft) 0%, #faf5ff 100%)",
          borderColor: "var(--accent-soft)",
        }}
      >
        <div style={{ fontSize: 24, marginBottom: 6 }}>✉️</div>
        <div style={{ fontWeight: 600, marginBottom: 4, fontSize: 15 }}>Get notified when this changes</div>
        <div style={{ color: "var(--muted)", fontSize: 13, marginBottom: 16 }}>
          We&apos;ll email you the moment the status updates.
        </div>
        <div style={{ display: "flex", gap: 8, justifyContent: "center" }}>
          <Link
            href="/signup"
            style={{
              padding: "10px 18px",
              borderRadius: 10,
              background: "var(--accent-gradient)",
              color: "#fff",
              textDecoration: "none",
              fontWeight: 600,
              fontSize: 14,
              boxShadow: "var(--shadow-md)",
            }}
          >
            Create an account
          </Link>
          <Link
            href="/login"
            style={{
              padding: "10px 18px",
              borderRadius: 10,
              background: "var(--card)",
              color: "var(--fg-soft)",
              textDecoration: "none",
              fontWeight: 500,
              fontSize: 14,
              border: "1px solid var(--border)",
            }}
          >
            Sign in
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div style={{ ...cardStyle, marginTop: 16 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
        <span
          aria-hidden
          style={{
            width: 32,
            height: 32,
            borderRadius: 8,
            background: "var(--accent-soft)",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            color: "var(--accent)",
            fontSize: 16,
          }}
        >
          🔔
        </span>
        <div>
          <div style={{ fontWeight: 600, fontSize: 15 }}>Notify me on changes</div>
          <div style={{ color: "var(--muted)", fontSize: 12 }}>One-click unsubscribe in every email.</div>
        </div>
      </div>
      <form onSubmit={handle} style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 16 }}>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            required
            style={{ ...inputStyle, flex: 2, minWidth: 200 }}
          />
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="Label (optional)"
            style={{ ...inputStyle, flex: 1, minWidth: 140 }}
          />
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <label style={{ fontSize: 12, color: "var(--muted)", fontWeight: 500 }}>Check</label>
          <IntervalPicker value={intervalSeconds} onChange={setIntervalSeconds} />
          <button type="submit" disabled={submitting || !email.trim()} style={{ ...buttonStyle, marginLeft: "auto" }}>
            {submitting ? "Saving…" : "Notify me"}
          </button>
        </div>
      </form>
      {status && (
        <div
          style={{
            marginTop: 14,
            padding: "10px 14px",
            borderRadius: 10,
            fontSize: 13,
            fontWeight: 500,
            background: status.kind === "ok" ? "var(--success-bg)" : "var(--danger-bg)",
            border: `1px solid ${status.kind === "ok" ? "var(--success-border)" : "var(--danger-border)"}`,
            color: status.kind === "ok" ? "var(--success)" : "var(--danger)",
          }}
        >
          {status.msg}
        </div>
      )}
    </div>
  );
}
