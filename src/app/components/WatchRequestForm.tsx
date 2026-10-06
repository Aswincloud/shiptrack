"use client";

import { useEffect, useState } from "react";
import { inputStyle, buttonStyle, buttonGhostStyle } from "@/app/styles";

interface Me {
  userId: string;
  email: string;
}

type Status = { kind: "ok" | "err"; msg: string };
type Channel = "email" | "whatsapp";

/**
 * "Tell me when this shows up" for a shipment the carrier doesn't know yet.
 *
 * Unlike the home page's notify box this doesn't require an account: anyone
 * landing on a shared track link can ask. Two channels, one watch each:
 *
 *  - Email: the API mails a confirmation link and alerts start when it's
 *    clicked, so nobody can sign someone else up.
 *  - WhatsApp: the visitor types their number, we send a one-time code to it,
 *    they type it back, and the watch is active. Proves they hold the phone.
 */
export function WatchRequestForm({
  carrier,
  carrierName,
  trackingNumber,
  embedded = false,
  mode = "appear",
}: {
  carrier: string;
  carrierName: string;
  trackingNumber: string;
  // Host card already explains what this is (the home page's "not in their
  // system yet" panel), so drop our own heading and blurb.
  embedded?: boolean;
  // "appear": the carrier doesn't know the number yet. "changes": it's already
  // moving and the visitor wants to hear about the next scans.
  mode?: "appear" | "changes";
}) {
  const [channel, setChannel] = useState<Channel>("email");
  const [waAvailable, setWaAvailable] = useState(false);
  const [signedIn, setSignedIn] = useState(false);
  const [email, setEmail] = useState("");
  const [label, setLabel] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [status, setStatus] = useState<Status | null>(null);
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState<{ requestId: string; phoneDisplay: string; expiresAt: number } | null>(null);
  const [code, setCode] = useState("");

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

  async function sendCode(e?: React.FormEvent) {
    e?.preventDefault();
    setSubmitting(true);
    setStatus(null);
    try {
      const res = await fetch("/api/whatsapp/guest-otp/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: phone.trim(), carrier, trackingNumber, label: label.trim() || undefined }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setStatus({ kind: "err", msg: waErrorText(body.error, body) });
        return;
      }
      setOtp({ requestId: body.requestId, phoneDisplay: body.phoneDisplay, expiresAt: body.expiresAt });
      setCode("");
    } catch (err) {
      setStatus({ kind: "err", msg: err instanceof Error ? err.message : "Network error" });
    } finally {
      setSubmitting(false);
    }
  }

  async function verifyCode(e: React.FormEvent) {
    e.preventDefault();
    if (!otp) return;
    setSubmitting(true);
    setStatus(null);
    try {
      const res = await fetch("/api/whatsapp/guest-otp/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requestId: otp.requestId, code: code.trim() }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (body.error === "expired" || body.error === "no_code" || body.error === "too_many_attempts") setOtp(null);
        setStatus({ kind: "err", msg: waErrorText(body.error, body) });
        return;
      }
      setOtp(null);
      setPhone("");
      setLabel("");
      setStatus({
        kind: "ok",
        msg: `Done. We'll message ${body.phoneDisplay} on WhatsApp ${mode === "changes" ? `at each milestone for ${trackingNumber}` : `when ${trackingNumber} appears, then at each milestone`}. Reply STOP any time.`,
      });
    } catch (err) {
      setStatus({ kind: "err", msg: err instanceof Error ? err.message : "Network error" });
    } finally {
      setSubmitting(false);
    }
  }

  const showWhatsApp = waAvailable && !signedIn;

  return (
    <div>
      {!embedded && (
        <>
          <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 4 }}>
            {mode === "changes" ? "Get notified when this changes" : "Want to know when it appears?"}
          </div>
          <div style={{ color: "var(--muted)", fontSize: 13, lineHeight: 1.5, marginBottom: 14 }}>
            {mode === "changes" ? "We'll check this shipment and tell you about each update" : "We’ll keep checking and let you know"}{showWhatsApp ? " by email or WhatsApp" : " by email"}.
          </div>
        </>
      )}

      {showWhatsApp && !otp && (
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

      {channel === "whatsapp" && showWhatsApp ? (
        otp ? (
          <form onSubmit={verifyCode} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <div style={{ fontSize: 13 }}>
              Enter the code we sent to <strong>{otp.phoneDisplay}</strong> on WhatsApp.
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
              <input
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                placeholder="6-digit code"
                aria-label="Verification code"
                required
                style={{ ...inputStyle, width: 150, fontSize: 18, letterSpacing: "0.12em", textAlign: "center" }}
              />
              <button type="submit" disabled={submitting || code.length !== 6} style={buttonStyle}>
                {submitting ? "…" : "Verify"}
              </button>
              <button type="button" onClick={() => sendCode()} disabled={submitting} style={buttonGhostStyle}>
                Resend
              </button>
              <button
                type="button"
                onClick={() => {
                  setOtp(null);
                  setStatus(null);
                }}
                disabled={submitting}
                style={buttonGhostStyle}
              >
                Change number
              </button>
            </div>
          </form>
        ) : (
          <form onSubmit={sendCode} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="WhatsApp number, e.g. 98765 43210"
                aria-label="WhatsApp number"
                autoComplete="tel"
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
            <button type="submit" disabled={submitting || !phone.trim()} style={{ ...buttonStyle, alignSelf: "flex-start" }}>
              {submitting ? "Sending…" : "Send code"}
            </button>
          </form>
        )
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

function waErrorText(error: string | undefined, j: { retryAfter?: number; attemptsLeft?: number }): string {
  switch (error) {
    case "invalid_phone":
      return "That doesn't look like a WhatsApp number. Indian numbers can be typed as 98765 43210; others need the country code.";
    case "not_on_whatsapp":
      return "That number isn't on WhatsApp.";
    case "already_watching":
      return "That number already gets WhatsApp updates for this shipment.";
    case "cooldown":
      return `Please wait ${j.retryAfter ?? 60}s before requesting another code.`;
    case "rate_limited":
      return "Too many codes requested. Try again later, or use email instead.";
    case "expired":
    case "no_code":
      return "That code has expired. Request a new one.";
    case "too_many_attempts":
      return "Too many wrong attempts. Request a new code.";
    case "invalid_code":
      return j.attemptsLeft !== undefined ? `That code isn't right. ${j.attemptsLeft} attempt${j.attemptsLeft === 1 ? "" : "s"} left.` : "That code isn't right.";
    case "not_configured":
      return "WhatsApp alerts aren't available right now. Use email instead.";
    default:
      return "Couldn't send the code. Try again shortly.";
  }
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
