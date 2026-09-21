"use client";

import { useEffect, useState } from "react";
import { inputStyle, buttonStyle } from "@/app/styles";

interface Me {
  userId: string;
  email: string;
}

type Status = { kind: "ok" | "err"; msg: string };

/**
 * "Tell me when this shows up" for a shipment the carrier doesn't know yet.
 *
 * Unlike the home page's notify box this doesn't require an account: anyone
 * landing on a shared track link can leave an address. The watch is only
 * registered as a request — the API mails a confirmation link and alerts don't
 * start until it's clicked — so this can't be used to sign someone else up.
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
  const [email, setEmail] = useState("");
  const [label, setLabel] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [status, setStatus] = useState<Status | null>(null);

  // Signed-in visitors get their own address filled in; signed-out ones just
  // see an empty box. Either way the form works.
  useEffect(() => {
    let cancelled = false;
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((b: Me | null) => {
        if (!cancelled && b?.email) setEmail((e) => e || b.email);
      })
      .catch(() => {
        /* signed out — nothing to prefill */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const cleaned = email.trim();
    if (!cleaned) return;
    setSubmitting(true);
    setStatus(null);
    try {
      const res = await fetch("/api/watches", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: cleaned,
          carrier,
          trackingNumber,
          label: label.trim() || undefined,
        }),
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

  return (
    <div>
      {!embedded && (
        <>
          <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 4 }}>
            Want to know when it appears?
          </div>
          <div style={{ color: "var(--muted)", fontSize: 13, lineHeight: 1.5, marginBottom: 14 }}>
            Freshly-booked shipments can take a few hours to show up at {carrierName}. Leave your
            email and we&rsquo;ll check this number every hour for the next couple of days — less
            often after that — and mail you as soon as it appears, then on every change after.
            One-click unsubscribe in every email.
          </div>
        </>
      )}
      <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
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
        <button
          type="submit"
          disabled={submitting || !email.trim()}
          style={{ ...buttonStyle, alignSelf: "flex-start" }}
        >
          {submitting ? "Saving…" : "Notify me"}
        </button>
      </form>
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
    default:
      return "Couldn't set up the alert. Try again shortly.";
  }
}
