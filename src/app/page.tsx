"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import type { TrackingResult } from "@/carriers/types";
import { AUTO_CARRIER, detectCarriers } from "@/carriers/detect";
import { humanStatus } from "@/lib/status";
import { inputStyle, buttonStyle, buttonGhostStyle, cardStyle, statusPillStyle } from "./styles";
import { Timeline } from "./components/Timeline";
import { ResultMeta } from "./components/ResultMeta";
import { ShareButton } from "./components/ShareButton";
import { CopyButton } from "./components/CopyButton";
import { ResultSkeleton } from "./components/ResultSkeleton";
import { IntervalPicker } from "./components/IntervalPicker";

const DEFAULT_INTERVAL_SECONDS = 15 * 60;
const LAST_CARRIER_KEY = "shiptrack:last-carrier";

const CARRIER_LABELS: Record<string, string> = {
  bluedart: "Blue Dart",
  shiprocket: "Shiprocket",
  delhivery: "Delhivery",
  stcourier: "ST Courier",
  tpc: "Professional Couriers",
  amazon: "Amazon Shipping",
};
function labelForCarrier(id: string): string {
  return CARRIER_LABELS[id] ?? id;
}
function isKnownCarrier(id: string): boolean {
  return id === AUTO_CARRIER || id in CARRIER_LABELS;
}
function listLabels(ids: string[]): string {
  const names = ids.map(labelForCarrier);
  return names.length <= 1 ? names.join("") : `${names.slice(0, -1).join(", ")} or ${names[names.length - 1]}`;
}

type ApiFailure = { error?: string; message?: string };
type LookupOutcome =
  | { ok: true; carrier: string; result: TrackingResult }
  | { ok: false; carrier: string; status: number; body: ApiFailure };

async function lookupOne(carrierId: string, tracking: string): Promise<LookupOutcome> {
  const res = await fetch(`/api/track/${encodeURIComponent(carrierId)}/${encodeURIComponent(tracking)}`);
  const body = await res.json().catch(() => ({}));
  return res.ok
    ? { ok: true, carrier: carrierId, result: body as TrackingResult }
    : { ok: false, carrier: carrierId, status: res.status, body: body as ApiFailure };
}

// Resolve as soon as any candidate succeeds; otherwise collect every failure.
function firstSuccess(lookups: Promise<LookupOutcome>[]): Promise<{ hit: LookupOutcome | null; failures: LookupOutcome[] }> {
  return new Promise((resolve) => {
    const failures: LookupOutcome[] = [];
    let pending = lookups.length;
    for (const p of lookups) {
      p.then(
        (o) => {
          if (o.ok) return resolve({ hit: o, failures });
          failures.push(o);
          if (--pending === 0) resolve({ hit: null, failures });
        },
        () => {
          failures.push({ ok: false, carrier: "", status: 0, body: { error: "network" } });
          if (--pending === 0) resolve({ hit: null, failures });
        },
      );
    }
  });
}

// Turn API error codes into copy a person can act on. Carrier-specific
// invalid_input messages are already good, so those pass through.
function describeFailure(f: LookupOutcome & { ok: false }, carrierId: string): { msg: string; retry: boolean } {
  const name = labelForCarrier(carrierId);
  switch (f.body.error) {
    case "not_found":
      return { msg: `No shipment found with that number at ${name}.`, retry: false };
    case "invalid_input":
      return { msg: f.body.message ?? `That doesn't look like a valid ${name} tracking number.`, retry: false };
    case "rate_limited":
      return { msg: `${name} is rate-limiting lookups right now. Try again in a minute.`, retry: true };
    case "upstream_error":
      return { msg: `Couldn't reach ${name} just now. Try again shortly.`, retry: true };
    case "network":
      return { msg: "Network error. Check your connection and try again.", retry: true };
    default:
      return { msg: f.body.message ?? f.body.error ?? "Something went wrong. Try again.", retry: true };
  }
}

type UiError = { msg: string; retry: boolean };

export default function Home() {
  const [carrier, setCarrier] = useState<string>(AUTO_CARRIER);
  const [tracking, setTracking] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<TrackingResult | null>(null);
  // Carrier the shown result actually came from (differs from `carrier` in auto mode).
  const [resolvedCarrier, setResolvedCarrier] = useState<string | null>(null);
  const [error, setError] = useState<UiError | null>(null);
  // When a track comes back not_found, remember the (carrier, tracking) the
  // user typed so we can offer to pre-watch it before the carrier ingests it.
  const [notFound, setNotFound] = useState<{ carrier: string; tracking: string } | null>(null);

  const runLookup = useCallback(async (carrierSel: string, raw: string) => {
    const cleaned = raw.trim();
    if (!cleaned) return;
    setLoading(true);
    setError(null);
    setResult(null);
    setResolvedCarrier(null);
    setNotFound(null);

    const targets = carrierSel === AUTO_CARRIER ? detectCarriers(cleaned) : [carrierSel];
    if (targets.length === 0) {
      setError({
        msg: "That doesn't look like a tracking number we recognise. Pick the carrier from the list and try again.",
        retry: false,
      });
      setLoading(false);
      return;
    }

    try {
      const { hit, failures } = await firstSuccess(targets.map((id) => lookupOne(id, cleaned)));
      if (hit && hit.ok) {
        setResult(hit.result);
        setResolvedCarrier(hit.carrier);
        // Make the lookup addressable: refresh/back/share keeps the result.
        const q = new URLSearchParams({ carrier: hit.carrier, tracking: cleaned });
        window.history.replaceState(null, "", `/?${q}`);
        return;
      }

      if (carrierSel !== AUTO_CARRIER) {
        const f = failures[0];
        if (f && !f.ok) {
          setError(describeFailure(f, carrierSel));
          // A not_found AWB is often just one the carrier hasn't scanned yet —
          // offer to watch it so the user gets alerted once it appears.
          if (f.body.error === "not_found") setNotFound({ carrier: carrierSel, tracking: cleaned });
        }
        return;
      }

      // Auto mode and nothing resolved. If every candidate said "not found",
      // say which ones we asked; otherwise surface the most useful failure.
      const notFoundAll = failures.every((f) => !f.ok && f.body.error === "not_found");
      if (notFoundAll) {
        setError({
          msg: `No shipment found with that number at ${listLabels(targets)}. If it was booked in the last day, pick the carrier and we can watch it for you.`,
          retry: false,
        });
        return;
      }
      const worst =
        failures.find((f) => !f.ok && (f.body.error === "rate_limited" || f.body.error === "upstream_error" || f.body.error === "network")) ??
        failures[0];
      if (worst && !worst.ok) setError(describeFailure(worst, worst.carrier || targets[0]));
    } catch (err) {
      setError({ msg: err instanceof Error ? err.message : "Network error", retry: true });
    } finally {
      setLoading(false);
    }
  }, []);

  // Restore state on load: ?carrier=&tracking= deep links win, else the last
  // carrier this browser used. Done async so no setState runs synchronously
  // inside the effect body.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      await Promise.resolve();
      if (cancelled) return;
      const params = new URLSearchParams(window.location.search);
      const qCarrier = params.get("carrier") ?? "";
      const qTracking = (params.get("tracking") ?? "").trim();
      let stored: string | null = null;
      try {
        stored = window.localStorage.getItem(LAST_CARRIER_KEY);
      } catch {
        /* storage unavailable */
      }
      const initial = isKnownCarrier(qCarrier) ? qCarrier : stored && isKnownCarrier(stored) ? stored : AUTO_CARRIER;
      setCarrier(initial);
      if (qTracking) {
        setTracking(qTracking);
        void runLookup(initial, qTracking);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [runLookup]);

  function chooseCarrier(id: string) {
    setCarrier(id);
    try {
      window.localStorage.setItem(LAST_CARRIER_KEY, id);
    } catch {
      /* storage unavailable */
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    void runLookup(carrier, tracking);
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
                  "Free, open-source shipment tracking for Blue Dart, Delhivery, Amazon Shipping, ST Courier, TPC and Shiprocket with optional email alerts on status changes.",
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
            background: "var(--hero-text-gradient)",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
            backgroundClip: "text",
            lineHeight: 1.1,
          }}
        >
          Track shipments,<br />get instant alerts
        </h1>
        <p style={{ color: "var(--muted)", margin: 0, fontSize: 16, maxWidth: 480, marginInline: "auto" }}>
          Paste a tracking or AWB number from Blue Dart, Delhivery, Amazon
          Shipping, ST Courier, TPC or Shiprocket to see live status, then opt
          in to email alerts when it changes.
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
          onChange={(e) => chooseCarrier(e.target.value)}
          aria-label="Carrier"
          style={{ ...inputStyle, border: "none", background: "transparent", fontWeight: 500 }}
        >
          <option value={AUTO_CARRIER}>Auto-detect carrier</option>
          <option value="bluedart">Blue Dart</option>
          <option value="shiprocket">Shiprocket</option>
          <option value="delhivery">Delhivery</option>
          <option value="stcourier">ST Courier</option>
          <option value="tpc">Professional Couriers (TPC)</option>
          <option value="amazon">Amazon Shipping</option>
        </select>
        <input
          value={tracking}
          onChange={(e) => setTracking(e.target.value)}
          placeholder="Enter tracking / AWB number"
          aria-label="Tracking number"
          autoComplete="off"
          style={{ ...inputStyle, flex: 1, minWidth: 220, border: "none", background: "transparent", fontSize: 15 }}
        />
        <button type="submit" disabled={loading || !tracking.trim()} style={buttonStyle}>
          {loading ? "Tracking…" : "Track →"}
        </button>
      </form>

      {carrier === "delhivery" && (
        <div
          style={{
            ...cardStyle,
            padding: "12px 16px",
            marginTop: 12,
            background: "var(--warning-bg)",
            borderColor: "var(--warning-border)",
            display: "flex",
            gap: 10,
            alignItems: "flex-start",
            fontSize: 13,
            lineHeight: 1.5,
            color: "var(--fg-soft)",
          }}
        >
          <span aria-hidden style={{ fontSize: 15 }}>ℹ️</span>
          <span>
            <strong>Delhivery isn&apos;t fully public yet.</strong> Unlike Blue Dart, Delhivery
            has no credential-free tracking page — its API only returns shipments booked under
            our own Delhivery account. So this works for the operator&apos;s parcels, but a random
            Delhivery AWB will show &ldquo;not found.&rdquo; For most e-commerce Delhivery
            parcels, try <button type="button" onClick={() => chooseCarrier("shiprocket")} style={linkBtnStyle}>Shiprocket</button> instead.
          </span>
        </div>
      )}

      {loading && <ResultSkeleton />}

      {error && (
        <div
          role="alert"
          style={{
            ...cardStyle,
            borderColor: "var(--danger-border)",
            background: "var(--danger-bg)",
            color: "var(--danger)",
            display: "flex",
            alignItems: "center",
            gap: 10,
            flexWrap: "wrap",
          }}
        >
          <span aria-hidden style={{ fontSize: 16 }}>⚠</span>
          <span style={{ fontSize: 14, fontWeight: 500, flex: 1, minWidth: 200 }}>{error.msg}</span>
          {error.retry && (
            <button
              type="button"
              onClick={() => void runLookup(carrier, tracking)}
              style={{ ...buttonGhostStyle, padding: "7px 14px", fontSize: 13 }}
            >
              Retry
            </button>
          )}
        </div>
      )}

      {notFound && (
        <div style={{ ...cardStyle, padding: 0, overflow: "hidden", marginBottom: 8 }}>
          <div
            style={{
              padding: "16px 20px",
              background: "var(--accent-soft)",
              borderBottom: "1px solid var(--border)",
            }}
          >
            <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 4 }}>
              Not in {labelForCarrier(notFound.carrier)}&rsquo;s system yet
            </div>
            <div style={{ fontSize: 13, color: "var(--fg-soft)", lineHeight: 1.5 }}>
              Freshly-booked shipments can take a few hours to a day to appear. Add
              it to your watchlist and we&rsquo;ll email you the moment it shows up
              and on every change after.
            </div>
          </div>
          <div style={{ padding: "4px 4px 0" }}>
            <NotifyForm carrier={notFound.carrier} trackingNumber={notFound.tracking} embedded />
          </div>
        </div>
      )}

      {result && (
        <>
          <div style={{ ...cardStyle, padding: 0, overflow: "hidden", boxShadow: "var(--shadow-md)" }}>
            <div
              style={{
                padding: "20px 24px",
                background: "linear-gradient(135deg, var(--accent-soft) 0%, var(--accent-wash) 100%)",
                borderBottom: "1px solid var(--border)",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                <div>
                  <div style={{ fontSize: 12, color: "var(--muted)", fontWeight: 500, marginBottom: 4 }}>
                    {labelForCarrier(result.carrier).toUpperCase()} · WAYBILL
                    {carrier === AUTO_CARRIER && <span style={{ fontWeight: 400 }}> · auto-detected</span>}
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
              <ResultMeta events={result.events} estimatedDelivery={result.estimatedDelivery} />
              <div style={{ marginTop: 16 }}>
                <ShareButton
                  url={`${typeof window !== "undefined" ? window.location.origin : ""}/track/${encodeURIComponent(result.carrier)}/${encodeURIComponent(result.trackingNumber)}`}
                  title={`Track ${result.trackingNumber}`}
                  text={`Tracking ${labelForCarrier(result.carrier)} shipment ${result.trackingNumber} — ${humanStatus(result.status)}`}
                />
              </div>
            </div>

            <div style={{ padding: "8px 24px 20px" }}>
              <Timeline events={result.events} />
            </div>
          </div>

          <NotifyForm carrier={resolvedCarrier ?? result.carrier} trackingNumber={result.trackingNumber} />
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

function NotifyForm({
  carrier,
  trackingNumber,
  embedded = false,
}: {
  carrier: string;
  trackingNumber: string;
  embedded?: boolean;
}) {
  // When embedded inside another card (e.g. the pre-track prompt), shed our own
  // card chrome so we don't double up borders/background.
  const outerStyle = embedded ? { padding: 16 } : { ...cardStyle, marginTop: 16 };
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
      } else if (body.status === "pending_confirmation") {
        // Not your own account address — alerts don't start until whoever owns
        // that inbox clicks the confirmation link.
        setStatus({
          kind: "ok",
          msg: `Confirmation sent to ${email}. Alerts start once that link is clicked.`,
        });
        setLabel("");
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
          ...outerStyle,
          textAlign: "center",
          background: embedded ? "transparent" : "linear-gradient(135deg, var(--accent-soft) 0%, var(--accent-wash) 100%)",
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
    <div style={outerStyle}>
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

const linkBtnStyle: React.CSSProperties = {
  background: "none",
  border: "none",
  padding: 0,
  font: "inherit",
  color: "var(--accent)",
  textDecoration: "underline",
  cursor: "pointer",
};
