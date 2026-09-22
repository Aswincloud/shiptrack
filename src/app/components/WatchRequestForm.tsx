"use client";

import { useEffect, useRef, useState } from "react";
import { inputStyle, buttonStyle, buttonGhostStyle } from "@/app/styles";

interface Me {
  userId: string;
  email: string;
}

type Status = { kind: "ok" | "err"; msg: string };
type Channel = "email" | "whatsapp";

// What POST /api/watches returns for channel "whatsapp".
interface WhatsAppPending {
  id: string;
  code: string;
  message: string;
  waLink: string;
  businessNumberDisplay: string;
  expiresAt: number;
}

/**
 * "Tell me when this shows up" for a shipment the carrier doesn't know yet.
 *
 * Unlike the home page's notify box this doesn't require an account: anyone
 * landing on a shared track link can ask. Two channels, one watch each:
 *
 *  - Email: the API mails a confirmation link and alerts start when it's
 *    clicked, so nobody can sign someone else up.
 *  - WhatsApp: no number is typed. The visitor taps a wa.me link that opens
 *    WhatsApp on our business number with "VERIFY <code>" pre-filled; the
 *    inbound message carries their number and is itself the opt-in, so the
 *    watch activates the moment it arrives. This component polls the watch
 *    until that happens.
 */
export function WatchRequestForm({
  carrier,
  carrierName,
  trackingNumber,
  embedded = false,
}: {
  carrier: string;
  carrierName: string;
  trackingNumber: string;
  // Host card already explains what this is (the home page's "not in their
  // system yet" panel), so drop our own heading and blurb.
  embedded?: boolean;
}) {
  const [channel, setChannel] = useState<Channel>("email");
  const [waAvailable, setWaAvailable] = useState(false);
  const [signedIn, setSignedIn] = useState(false);
  const [email, setEmail] = useState("");
  const [label, setLabel] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [status, setStatus] = useState<Status | null>(null);
  const [wa, setWa] = useState<WhatsAppPending | null>(null);
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));
  const waDone = useRef(false);

  // Signed-in visitors get their own address filled in and don't see the
  // WhatsApp option — their watches already reach the number linked in
  // Settings. Signed-out ones see WhatsApp only when the site has it set up.
  useEffect(() => {
    let cancelled = false;
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((b: Me | null) => {
        if (cancelled) return;
        if (b?.email) {
          setSignedIn(true);
          setEmail((e) => e || b.email);
        }
      })
      .catch(() => {});
    fetch("/api/whatsapp/available")
      .then((r) => r.json())
      .then((b: { available?: boolean }) => {
        if (!cancelled && b?.available) setWaAvailable(true);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  // While a WhatsApp code is outstanding, watch the request until the webhook
  // flips it — or it expires / gets refused (cap or duplicate; the reason is
  // sent to them on WhatsApp).
  useEffect(() => {
    if (!wa) return;
    waDone.current = false;
    const id = setInterval(async () => {
      setNow(Math.floor(Date.now() / 1000));
      if (waDone.current) return;
      try {
        const res = await fetch(`/api/watches/${encodeURIComponent(wa.id)}`);
        if (!res.ok) return;
        const b = (await res.json()) as { status?: string; phoneDisplay?: string | null };
        if (b.status === "active") {
          waDone.current = true;
          setWa(null);
          setStatus({
            kind: "ok",
            msg: `Watching. We'll message ${b.phoneDisplay ?? "your WhatsApp"} as soon as ${trackingNumber} appears, then on every milestone after. Reply STOP any time.`,
          });
        } else if (b.status === "cancelled") {
          waDone.current = true;
          setWa(null);
          setStatus({
            kind: "err",
            msg: "We couldn't set that up — check WhatsApp for the reason. Usually this number already gets alerts for this shipment, or has hit today's limit.",
          });
        }
      } catch {
        /* transient; try again next tick */
      }
    }, 3000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wa?.id]);

  async function submitEmail(e: React.FormEvent) {
    e.preventDefault();
    const cleaned = email.trim();
    if (!cleaned) return;
    setSubmitting(true);
    setStatus(null);
    try {
      const res = await fetch("/api/watches", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: cleaned, carrier, trackingNumber, label: label.trim() || undefined }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setStatus({ kind: "err", msg: body.message ?? failureMessage(body.error) });
        return;
      }
      setStatus({ kind: "ok", msg: successMessage(body, cleaned) });
      setLabel("");
    } catch (err) {
      setStatus({ kind: "err", msg: err instanceof Error ? err.message : "Network error" });
    } finally {
      setSubmitting(false);
    }
  }

  async function startWhatsApp() {
    setSubmitting(true);
    setStatus(null);
    try {
      const res = await fetch("/api/watches", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channel: "whatsapp", carrier, trackingNumber, label: label.trim() || undefined }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setStatus({ kind: "err", msg: body.message ?? failureMessage(body.error) });
        return;
      }
      setWa(body as WhatsAppPending);
    } catch (err) {
      setStatus({ kind: "err", msg: err instanceof Error ? err.message : "Network error" });
    } finally {
      setSubmitting(false);
    }
  }

  const showWhatsApp = waAvailable && !signedIn;
  const minutesLeft = wa ? Math.max(0, Math.ceil((wa.expiresAt - now) / 60)) : 0;
  const expired = wa !== null && wa.expiresAt <= now;

  return (
    <div>
      {!embedded && (
        <>
          <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 4 }}>
            Want to know when it appears?
          </div>
          <div style={{ color: "var(--muted)", fontSize: 13, lineHeight: 1.5, marginBottom: 14 }}>
            Freshly-booked shipments can take a few hours to show up at {carrierName}. We&rsquo;ll check
            this number every hour for the next couple of days — less often after that — and tell you as
            soon as it appears, then on every change after.{" "}
            {showWhatsApp ? "Email gets every update; WhatsApp gets the moments that matter. " : ""}
            One-click unsubscribe in every email{showWhatsApp ? ", reply STOP on WhatsApp" : ""}.
          </div>
        </>
      )}

      {showWhatsApp && !wa && (
        <div role="tablist" aria-label="How to notify you" style={{ display: "inline-flex", gap: 4, marginBottom: 12, padding: 3, borderRadius: 10, background: "var(--bg-soft, rgba(0,0,0,0.04))" }}>
          {(["email", "whatsapp"] as Channel[]).map((c) => (
            <button
              key={c}
              type="button"
              role="tab"
              aria-selected={channel === c}
              onClick={() => {
                setChannel(c);
                setStatus(null);
              }}
              style={{
                ...buttonGhostStyle,
                padding: "6px 14px",
                fontSize: 13,
                fontWeight: 600,
                border: "none",
                background: channel === c ? "var(--bg, #fff)" : "transparent",
                boxShadow: channel === c ? "var(--shadow-sm, 0 1px 2px rgba(0,0,0,0.08))" : "none",
              }}
            >
              {c === "email" ? "Email" : "WhatsApp"}
            </button>
          ))}
        </div>
      )}

      {wa ? (
        <div>
          <div style={{ fontSize: 13, lineHeight: 1.5, marginBottom: 10 }}>
            Send this to <strong>{wa.businessNumberDisplay}</strong> from the WhatsApp you want alerts on.
            We read your number from the message, so there&rsquo;s nothing to type.
          </div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 12,
              flexWrap: "wrap",
              padding: "12px 14px",
              border: "1px solid var(--border)",
              borderRadius: 10,
              background: "var(--bg-soft, var(--bg))",
              marginBottom: 10,
            }}
          >
            <code style={{ fontSize: 18, fontWeight: 700, letterSpacing: "0.04em" }}>{wa.message}</code>
            <a
              href={wa.waLink}
              target="_blank"
              rel="noopener noreferrer"
              style={{ ...buttonStyle, textDecoration: "none", display: "inline-block" }}
            >
              Open WhatsApp
            </a>
          </div>
          <div style={{ color: "var(--muted)", fontSize: 13, marginBottom: 10 }}>
            {expired
              ? "That code has expired."
              : `Waiting for your message… this updates by itself. Code expires in ${minutesLeft} min.`}
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button type="button" onClick={startWhatsApp} disabled={submitting} style={buttonGhostStyle}>
              Get a new code
            </button>
            <button
              type="button"
              onClick={() => {
                waDone.current = true;
                setWa(null);
              }}
              style={buttonGhostStyle}
            >
              Cancel
            </button>
          </div>
        </div>
      ) : channel === "whatsapp" && showWhatsApp ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="Label (optional)"
            aria-label="Label for this shipment"
            maxLength={80}
            style={{ ...inputStyle, maxWidth: 320 }}
          />
          <button type="button" onClick={startWhatsApp} disabled={submitting} style={{ ...buttonStyle, alignSelf: "flex-start" }}>
            {submitting ? "…" : "Connect WhatsApp"}
          </button>
        </div>
      ) : (
        <form onSubmit={submitEmail} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              aria-label="Email address"
              autoComplete="email"
              required
              style={{ ...inputStyle, flex: 2, minWidth: 200 }}
            />
            <input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="Label (optional)"
              aria-label="Label for this shipment"
              maxLength={80}
              style={{ ...inputStyle, flex: 1, minWidth: 140 }}
            />
          </div>
          <button type="submit" disabled={submitting || !email.trim()} style={{ ...buttonStyle, alignSelf: "flex-start" }}>
            {submitting ? "Saving…" : "Notify me"}
          </button>
        </form>
      )}

      {status && (
        <div
          role="status"
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

function successMessage(body: { status?: string; duplicate?: boolean }, email: string): string {
  if (body.status === "active") {
    return body.duplicate
      ? `Already watching this shipment for ${email}.`
      : `Watching. We'll email ${email} on every status change.`;
  }
  return body.duplicate
    ? `We already emailed ${email} a confirmation link for this shipment — check your inbox or spam folder.`
    : `Almost there: check ${email} for a confirmation link. Alerts start once you click it.`;
}

function failureMessage(error: string | undefined): string {
  switch (error) {
    case "carrier_not_supported":
      return "We don't track that carrier.";
    case "invalid_input":
      return "That email doesn't look right. Check it and try again.";
    case "not_configured":
      return "Alerts aren't available on this site right now.";
    case "send_failed":
      return "We couldn't send the confirmation email. Try again shortly.";
    case "rate_limited":
      return "Too many alert requests right now. Try again in a little while.";
    default:
      return "Couldn't set up the alert. Try again shortly.";
  }
}
