"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { inputStyle, buttonStyle, buttonGhostStyle, cardStyle, pageWrapStyle } from "../styles";
import { PasswordStrength } from "../components/PasswordStrength";

// Mirrors GET /api/whatsapp/link.
interface WhatsAppStatus {
  available: boolean;
  otpAvailable: boolean;
  phone: string | null;
  phoneDisplay: string | null;
  verified: boolean;
  optIn: boolean;
  pending: {
    code: string;
    message: string;
    waLink: string;
    businessNumberDisplay: string;
    expiresAt: number;
  } | null;
  otp: { phoneDisplay: string; expiresAt: number } | null;
}

interface ApiKeySummary {
  id: string;
  name: string;
  prefix: string;
  created_at: number;
  last_used_at: number | null;
  revoked_at: number | null;
}

interface Props {
  email: string;
  name: string | null;
  isAdmin: boolean;
  hasPassword: boolean;
  createdAt: number;
  whatsapp: WhatsAppStatus;
  apiKeys: ApiKeySummary[];
  maxApiKeys: number;
  appUrl: string;
}

export function SettingsClient(props: Props) {
  return (
    <main style={pageWrapStyle}>
      <h1 style={{ fontSize: 28, fontWeight: 700, marginBottom: 6, letterSpacing: "-0.02em" }}>
        Account settings
      </h1>
      <p style={{ color: "var(--muted)", margin: "0 0 28px", fontSize: 15 }}>
        Manage your profile, password, and account.
      </p>

      <ProfileSection
        email={props.email}
        initialName={props.name}
        createdAt={props.createdAt}
        isAdmin={props.isAdmin}
      />
      {props.whatsapp.otpAvailable && <WhatsAppSection initial={props.whatsapp} />}
      <ApiKeysSection initial={props.apiKeys} max={props.maxApiKeys} appUrl={props.appUrl} />
      <PasswordSection hasPassword={props.hasPassword} />
      <DangerSection hasPassword={props.hasPassword} />

      <p style={{ marginTop: 24, color: "var(--muted)", fontSize: 14 }}>
        <Link href="/dashboard">← Back to dashboard</Link>
      </p>
    </main>
  );
}

function ProfileSection({
  email,
  initialName,
  createdAt,
  isAdmin,
}: {
  email: string;
  initialName: string | null;
  createdAt: number;
  isAdmin: boolean;
}) {
  const [name, setName] = useState(initialName ?? "");
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  // Self-service email change: submit a new address, we email it a confirm link.
  const [showEmailForm, setShowEmailForm] = useState(false);
  const [requestedEmail, setRequestedEmail] = useState("");
  const [emailSubmitting, setEmailSubmitting] = useState(false);
  const [emailFeedback, setEmailFeedback] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setFeedback(null);
    const trimmed = name.trim();
    const res = await fetch("/api/auth/me", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: trimmed || null }),
    });
    setSaving(false);
    if (res.ok) setFeedback({ kind: "ok", text: "Saved." });
    else setFeedback({ kind: "err", text: "Save failed." });
  }

  async function submitEmailRequest(e: React.FormEvent) {
    e.preventDefault();
    setEmailFeedback(null);
    const target = requestedEmail.trim().toLowerCase();
    if (!target) return;
    setEmailSubmitting(true);
    const res = await fetch("/api/auth/email-change-requests", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ newEmail: target }),
    });
    setEmailSubmitting(false);
    if (res.ok) {
      setShowEmailForm(false);
      setEmailFeedback({
        kind: "ok",
        text: `Check ${target} for a confirmation link to finish the change.`,
      });
      setRequestedEmail("");
      return;
    }
    const j = await res.json().catch(() => ({}));
    const msg =
      j.error === "same_as_current"
        ? "That's already your current email."
        : j.error === "email_taken"
          ? "That email is already in use by another account."
          : j.error === "invalid_email"
            ? "That doesn't look like a valid email."
            : "Couldn't send the confirmation. Try again.";
    setEmailFeedback({ kind: "err", text: msg });
  }

  return (
    <section style={{ ...cardStyle, marginBottom: 20 }}>
      <h2 style={sectionTitle}>Profile</h2>

      {/* Email block — kept OUTSIDE the name <form> so the inner request <form>
          isn't nested (nested forms are illegal HTML and React/the browser
          unnests them, which would route the "Submit request" button to the
          wrong handler — exactly the bug we hit). */}
      <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 16 }}>
        <label style={labelStyle}>Email</label>
        <input value={email} disabled style={{ ...inputStyle, opacity: 0.7 }} />
        {!showEmailForm ? (
          <button
            type="button"
            onClick={() => {
              setShowEmailForm(true);
              setEmailFeedback(null);
            }}
            style={{ ...buttonGhostStyle, padding: "6px 12px", fontSize: 12, marginTop: 6, alignSelf: "flex-start" }}
          >
            Change email
          </button>
        ) : (
          <div
            style={{
              marginTop: 8,
              padding: 12,
              background: "var(--neutral-bg, #f8fafc)",
              border: "1px solid var(--border)",
              borderRadius: 8,
            }}
          >
            <form onSubmit={submitEmailRequest} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <label style={{ ...labelStyle, fontSize: 12 }}>
                New email address
                <input
                  type="email"
                  value={requestedEmail}
                  onChange={(e) => setRequestedEmail(e.target.value)}
                  required
                  autoComplete="email"
                  placeholder="new@example.com"
                  style={inputStyle}
                />
              </label>
              <div style={{ fontSize: 12, color: "var(--muted)" }}>
                We&apos;ll email a confirmation link to the new address. The change
                applies once you click it.
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  type="submit"
                  disabled={emailSubmitting || !requestedEmail.trim()}
                  style={{ ...buttonStyle, padding: "8px 14px", fontSize: 13 }}
                >
                  {emailSubmitting ? "Sending…" : "Send confirmation"}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowEmailForm(false);
                    setRequestedEmail("");
                    setEmailFeedback(null);
                  }}
                  style={{ ...buttonGhostStyle, padding: "8px 14px", fontSize: 13 }}
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        )}
        {emailFeedback && (
          <span style={{ fontSize: 13, marginTop: 6, color: emailFeedback.kind === "ok" ? "var(--success)" : "var(--danger)" }}>
            {emailFeedback.text}
          </span>
        )}
      </div>

      <form onSubmit={save} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <label style={labelStyle}>
          Display name
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Optional — shown on emails and dashboard"
            maxLength={80}
            style={inputStyle}
            autoComplete="name"
          />
        </label>
        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          <button type="submit" disabled={saving} style={{ ...buttonStyle, padding: "9px 18px", fontSize: 14 }}>
            {saving ? "Saving…" : "Save profile"}
          </button>
          {feedback && (
            <span style={{ fontSize: 13, color: feedback.kind === "ok" ? "var(--success)" : "var(--danger)" }}>
              {feedback.text}
            </span>
          )}
        </div>
      </form>
      <div style={{ marginTop: 16, paddingTop: 16, borderTop: "1px dashed var(--border)", fontSize: 12, color: "var(--muted)" }}>
        Account created {new Date(createdAt * 1000).toLocaleDateString()}
        {isAdmin && (
          <>
            {" · "}
            <span style={{ color: "var(--accent)", fontWeight: 600 }}>Admin</span>
          </>
        )}
      </div>
    </section>
  );
}

function PasswordSection({ hasPassword }: { hasPassword: boolean }) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setFeedback(null);
    if (next.length < 8) {
      setFeedback({ kind: "err", text: "Password must be at least 8 characters." });
      return;
    }
    if (next !== confirm) {
      setFeedback({ kind: "err", text: "Passwords don't match." });
      return;
    }
    setSaving(true);
    const body: Record<string, string> = { newPassword: next };
    if (hasPassword) body.currentPassword = current;
    const res = await fetch("/api/auth/change-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    setSaving(false);
    if (res.ok) {
      setFeedback({ kind: "ok", text: hasPassword ? "Password updated." : "Password set." });
      setCurrent("");
      setNext("");
      setConfirm("");
    } else {
      const j = await res.json().catch(() => ({}));
      setFeedback({
        kind: "err",
        text:
          j.error === "invalid_credentials"
            ? "Current password is wrong."
            : j.error === "current_password_required"
              ? "Enter your current password."
              : "Couldn't update password.",
      });
    }
  }

  return (
    <section style={{ ...cardStyle, marginBottom: 20 }}>
      <h2 style={sectionTitle}>{hasPassword ? "Change password" : "Set a password"}</h2>
      {!hasPassword && (
        <p style={{ color: "var(--muted)", fontSize: 13, marginBottom: 14 }}>
          You signed in with a social provider and don&apos;t have a password yet. Setting one lets you also
          sign in with email + password.
        </p>
      )}
      <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {hasPassword && (
          <label style={labelStyle}>
            Current password
            <input
              type="password"
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
              required
              autoComplete="current-password"
              style={inputStyle}
            />
          </label>
        )}
        <label style={labelStyle}>
          New password
          <input
            type="password"
            value={next}
            onChange={(e) => setNext(e.target.value)}
            minLength={8}
            required
            autoComplete="new-password"
            style={inputStyle}
          />
          <PasswordStrength password={next} />
          <span style={{ fontSize: 12, color: "var(--muted)", marginTop: 4 }}>At least 8 characters.</span>
        </label>
        <label style={labelStyle}>
          Confirm new password
          <input
            type="password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            minLength={8}
            required
            autoComplete="new-password"
            style={inputStyle}
          />
        </label>
        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          <button type="submit" disabled={saving} style={{ ...buttonStyle, padding: "9px 18px", fontSize: 14 }}>
            {saving ? "Saving…" : hasPassword ? "Update password" : "Set password"}
          </button>
          {feedback && (
            <span style={{ fontSize: 13, color: feedback.kind === "ok" ? "var(--success)" : "var(--danger)" }}>
              {feedback.text}
            </span>
          )}
        </div>
      </form>
    </section>
  );
}

function DangerSection({ hasPassword }: { hasPassword: boolean }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function doDelete(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setDeleting(true);
    const body: Record<string, string> = {};
    if (hasPassword) body.password = password;
    else body.confirm = confirm;
    const res = await fetch("/api/auth/me", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    setDeleting(false);
    if (res.ok) {
      router.push("/");
      router.refresh();
      return;
    }
    const j = await res.json().catch(() => ({}));
    setError(
      j.error === "invalid_credentials"
        ? "Password is wrong."
        : j.error === "password_required"
          ? "Enter your password to confirm."
          : j.error === "confirm_required"
            ? 'Type "delete my account" to confirm.'
            : j.error === "last_admin"
              ? (j.message ?? "You're the only admin — promote someone else first.")
              : "Couldn't delete account.",
    );
  }

  return (
    <section style={{ ...cardStyle, borderColor: "var(--danger-border)", background: "var(--danger-bg, #fff1f2)" }}>
      <h2 style={{ ...sectionTitle, color: "var(--danger)" }}>Danger zone</h2>
      <p style={{ color: "var(--fg-soft)", fontSize: 14, marginTop: 0 }}>
        Deleting your account removes all your watches and event history. This can&apos;t be undone.
      </p>
      {!confirming ? (
        <button
          type="button"
          onClick={() => setConfirming(true)}
          style={{
            ...buttonGhostStyle,
            color: "var(--danger)",
            borderColor: "var(--danger-border)",
            background: "transparent",
            padding: "9px 18px",
            fontSize: 14,
          }}
        >
          Delete my account
        </button>
      ) : (
        <form onSubmit={doDelete} style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 8 }}>
          {hasPassword ? (
            <label style={labelStyle}>
              Confirm with your password
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
                style={inputStyle}
              />
            </label>
          ) : (
            <label style={labelStyle}>
              Type <code>delete my account</code> to confirm
              <input
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                required
                style={inputStyle}
              />
            </label>
          )}
          {error && <div style={{ fontSize: 13, color: "var(--danger)" }}>{error}</div>}
          <div style={{ display: "flex", gap: 8 }}>
            <button
              type="submit"
              disabled={deleting}
              style={{
                ...buttonStyle,
                background: "var(--danger)",
                backgroundImage: "none",
                padding: "9px 18px",
                fontSize: 14,
              }}
            >
              {deleting ? "Deleting…" : "Permanently delete account"}
            </button>
            <button
              type="button"
              onClick={() => {
                setConfirming(false);
                setError(null);
                setPassword("");
                setConfirm("");
              }}
              style={{ ...buttonGhostStyle, padding: "9px 18px", fontSize: 14 }}
            >
              Cancel
            </button>
          </div>
        </form>
      )}
    </section>
  );
}

// Opt-in WhatsApp alerts: type a number, a one-time code arrives on WhatsApp,
// type it back. Deliberately just that — no "connect" step that reads like
// granting an app access to an account.
function WhatsAppSection({ initial }: { initial: WhatsAppStatus }) {
  const [st, setSt] = useState<WhatsAppStatus>(initial);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [otpPhone, setOtpPhone] = useState("");
  const [otpSent, setOtpSent] = useState<{ phoneDisplay: string; expiresAt: number } | null>(initial.otp);
  const [otpCode, setOtpCode] = useState("");

  async function toggle(on: boolean) {
    setBusy(true);
    const res = await fetch("/api/whatsapp/link", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ optIn: on }),
    });
    setBusy(false);
    if (res.ok) {
      setSt((s) => ({ ...s, optIn: on }));
      setFeedback({ kind: "ok", text: on ? "WhatsApp alerts are on." : "WhatsApp alerts are off." });
    } else {
      setFeedback({ kind: "err", text: "Couldn't change that. Try again." });
    }
  }

  async function remove() {
    if (!confirm("Remove this WhatsApp number? You'll stop getting alerts there.")) return;
    setBusy(true);
    const res = await fetch("/api/whatsapp/link", { method: "DELETE" });
    setBusy(false);
    if (res.ok || res.status === 204) {
      setSt((s) => ({ ...s, phone: null, phoneDisplay: null, verified: false, optIn: false, pending: null, otp: null }));
      setOtpSent(null);
      setOtpCode("");
      setFeedback({ kind: "ok", text: "WhatsApp number removed." });
    }
  }

  async function otpSend(e?: React.FormEvent) {
    e?.preventDefault();
    setBusy(true);
    setFeedback(null);
    const res = await fetch("/api/whatsapp/otp/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(otpPhone.trim() ? { phone: otpPhone.trim() } : {}),
    });
    const j = (await res.json().catch(() => ({}))) as { error?: string; phoneDisplay?: string; expiresAt?: number; retryAfter?: number };
    setBusy(false);
    if (res.ok && j.phoneDisplay && j.expiresAt) {
      setOtpSent({ phoneDisplay: j.phoneDisplay, expiresAt: j.expiresAt });
      setOtpCode("");
      return;
    }
    setFeedback({ kind: "err", text: otpErrorText(j.error, j) });
  }

  async function otpVerify(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setFeedback(null);
    const res = await fetch("/api/whatsapp/otp/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: otpCode.trim() }),
    });
    const j = (await res.json().catch(() => ({}))) as WhatsAppStatus & { error?: string; attemptsLeft?: number };
    setBusy(false);
    if (res.ok) {
      setOtpSent(null);
      setOtpCode("");
      setOtpPhone("");
      setSt(j);
      setFeedback({ kind: "ok", text: `WhatsApp alerts are on for ${j.phoneDisplay}.` });
      return;
    }
    if (j.error === "expired" || j.error === "no_code" || j.error === "too_many_attempts") {
      setOtpSent(null);
      setOtpCode("");
    }
    setFeedback({ kind: "err", text: otpErrorText(j.error, j) });
  }

  return (
    <section style={{ ...cardStyle, marginBottom: 20 }}>
      <h2 style={sectionTitle}>WhatsApp alerts</h2>

      {st.verified && st.phone ? (
        <>
          <p style={{ margin: "0 0 12px", fontSize: 14 }}>
            <strong>{st.phoneDisplay}</strong> ·{" "}
            <span style={{ color: st.optIn ? "var(--success)" : "var(--muted)", fontWeight: 600 }}>
              alerts {st.optIn ? "on" : "off"}
            </span>
          </p>
          <p style={{ margin: "0 0 14px", color: "var(--muted)", fontSize: 13, lineHeight: 1.5 }}>
            Messages when a shipment is picked up, out for delivery, delivered, or has a problem. Reply STOP to
            any of them to turn these off.
          </p>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button type="button" onClick={() => toggle(!st.optIn)} disabled={busy} style={buttonStyle}>
              {st.optIn ? "Turn alerts off" : "Turn alerts on"}
            </button>
            <button type="button" onClick={remove} disabled={busy} style={buttonGhostStyle}>
              Remove number
            </button>
          </div>
        </>
      ) : otpSent ? (
        <form onSubmit={otpVerify} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <p style={{ margin: 0, fontSize: 14 }}>
            Enter the code we sent to <strong>{otpSent.phoneDisplay}</strong> on WhatsApp.
          </p>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            <input
              value={otpCode}
              onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              inputMode="numeric"
              maxLength={6}
              autoComplete="one-time-code"
              placeholder="6-digit code"
              aria-label="Verification code"
              required
              style={{ ...inputStyle, width: 160, fontSize: 18, letterSpacing: "0.12em", textAlign: "center" }}
            />
            <button type="submit" disabled={busy || otpCode.length !== 6} style={buttonStyle}>
              {busy ? "…" : "Verify"}
            </button>
            <button type="button" onClick={() => otpSend()} disabled={busy} style={buttonGhostStyle}>
              Resend
            </button>
            <button
              type="button"
              onClick={() => {
                setOtpSent(null);
                setOtpCode("");
                setFeedback(null);
              }}
              disabled={busy}
              style={buttonGhostStyle}
            >
              Change number
            </button>
          </div>
        </form>
      ) : (
        <form onSubmit={otpSend} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <p style={{ margin: 0, color: "var(--muted)", fontSize: 14, lineHeight: 1.5 }}>
            Get shipment updates on WhatsApp too. We&apos;ll send a code to confirm the number.
          </p>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            <input
              type="tel"
              value={otpPhone}
              onChange={(e) => setOtpPhone(e.target.value)}
              placeholder="98765 43210"
              aria-label="WhatsApp number"
              autoComplete="tel"
              required
              style={{ ...inputStyle, width: 220 }}
            />
            <button type="submit" disabled={busy || !otpPhone.trim()} style={buttonStyle}>
              {busy ? "…" : "Send code"}
            </button>
          </div>
        </form>
      )}

      {feedback && (
        <p style={{ margin: "12px 0 0", fontSize: 13, color: feedback.kind === "ok" ? "var(--success)" : "var(--danger)" }}>
          {feedback.text}
        </p>
      )}
    </section>
  );
}

function otpErrorText(error: string | undefined, j: { retryAfter?: number; attemptsLeft?: number }): string {
  switch (error) {
    case "invalid_phone":
      return "That doesn't look like a WhatsApp number. Indian numbers can be typed as 98765 43210; others need the country code.";
    case "not_on_whatsapp":
      return "That number isn't on WhatsApp, or can't receive messages from businesses.";
    case "cooldown":
      return `Please wait ${j.retryAfter ?? 60}s before requesting another code.`;
    case "rate_limited":
      return "Too many codes requested today. Try again tomorrow.";
    case "template_unavailable":
    case "not_configured":
      return "WhatsApp alerts aren't available right now.";
    case "send_failed":
      return "We couldn't send the code. Try again shortly.";
    case "no_code":
    case "expired":
      return "That code has expired. Request a new one.";
    case "too_many_attempts":
      return "Too many wrong attempts. Request a new code.";
    case "invalid_code":
      return j.attemptsLeft !== undefined ? `That code isn't right. ${j.attemptsLeft} attempt${j.attemptsLeft === 1 ? "" : "s"} left.` : "That code isn't right.";
    default:
      return "Something went wrong. Try again.";
  }
}


function fmtDate(epoch: number): string {
  return new Date(epoch * 1000).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

// Create, list and revoke personal API keys. Everything here uses the session
// cookie (fetch sends it automatically); a key can never manage keys.
function ApiKeysSection({ initial, max, appUrl }: { initial: ApiKeySummary[]; max: number; appUrl: string }) {
  const [keys, setKeys] = useState<ApiKeySummary[]>(initial);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState<{ key: string; name: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [feedback, setFeedback] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  const active = keys.filter((k) => !k.revoked_at);
  const atLimit = active.length >= max;

  async function create(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    setBusy(true);
    setFeedback(null);
    const res = await fetch("/api/api-keys", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: trimmed }),
    });
    const j = (await res.json().catch(() => ({}))) as ApiKeySummary & { key?: string; error?: string; message?: string };
    setBusy(false);
    if (res.ok && j.key) {
      setCreated({ key: j.key, name: j.name });
      setCopied(false);
      setKeys((ks) => [{ id: j.id, name: j.name, prefix: j.prefix, created_at: j.created_at, last_used_at: null, revoked_at: null }, ...ks]);
      setName("");
      return;
    }
    setFeedback({ kind: "err", text: j.message || "Couldn't create the key. Try again." });
  }

  async function revoke(id: string, keyName: string) {
    if (!confirm(`Revoke "${keyName}"? Any script using it stops working immediately.`)) return;
    setBusy(true);
    const res = await fetch(`/api/api-keys/${encodeURIComponent(id)}`, { method: "DELETE" });
    setBusy(false);
    if (res.ok || res.status === 204) {
      setKeys((ks) => ks.map((k) => (k.id === id ? { ...k, revoked_at: Math.floor(Date.now() / 1000) } : k)));
      setFeedback({ kind: "ok", text: `"${keyName}" revoked.` });
    } else {
      setFeedback({ kind: "err", text: "Couldn't revoke that key. Try again." });
    }
  }

  async function copyKey() {
    if (!created) return;
    try {
      await navigator.clipboard.writeText(created.key);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  return (
    <section style={{ ...cardStyle, marginBottom: 20 }}>
      <h2 style={sectionTitle}>API keys</h2>
      <p style={{ margin: "0 0 14px", fontSize: 14, color: "var(--muted)" }}>
        Add and manage your watches from a script. Send the key as{" "}
        <code style={codeStyle}>Authorization: Bearer st_…</code> to{" "}
        <code style={codeStyle}>{appUrl.replace(/^https?:\/\//, "").replace(/\/$/, "")}/api/watches</code>. A
        key acts as your account, so keep it secret.
      </p>

      {created && (
        <div
          style={{
            ...cardStyle,
            padding: 14,
            marginBottom: 14,
            background: "var(--success-bg, #ecfdf5)",
            borderColor: "var(--success-border, #a7f3d0)",
          }}
        >
          <p style={{ margin: "0 0 8px", fontSize: 13, fontWeight: 600 }}>
            Copy your new key now — it&apos;s shown only once:
          </p>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <code style={{ ...codeStyle, fontSize: 14, padding: "6px 10px", userSelect: "all", wordBreak: "break-all" }}>
              {created.key}
            </code>
            <button type="button" onClick={copyKey} style={buttonGhostStyle}>
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
          <button
            type="button"
            onClick={() => setCreated(null)}
            style={{ ...buttonGhostStyle, marginTop: 10 }}
          >
            I&apos;ve saved it
          </button>
        </div>
      )}

      {active.length > 0 && (
        <ul style={{ listStyle: "none", padding: 0, margin: "0 0 14px" }}>
          {keys
            .filter((k) => !k.revoked_at)
            .map((k) => (
              <li
                key={k.id}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  gap: 12,
                  padding: "10px 0",
                  borderBottom: "1px solid var(--border)",
                }}
              >
                <span style={{ fontSize: 14 }}>
                  <strong>{k.name}</strong>{" "}
                  <code style={codeStyle}>st_{k.prefix}…</code>
                  <br />
                  <span style={{ color: "var(--muted)", fontSize: 12 }}>
                    Created {fmtDate(k.created_at)} ·{" "}
                    {k.last_used_at ? `last used ${fmtDate(k.last_used_at)}` : "never used"}
                  </span>
                </span>
                <button type="button" onClick={() => revoke(k.id, k.name)} disabled={busy} style={buttonGhostStyle}>
                  Revoke
                </button>
              </li>
            ))}
        </ul>
      )}

      {atLimit ? (
        <p style={{ fontSize: 13, color: "var(--muted)", margin: 0 }}>
          You have the maximum of {max} active keys. Revoke one to create another.
        </p>
      ) : (
        <form onSubmit={create} style={{ display: "flex", gap: 8, alignItems: "flex-end", flexWrap: "wrap" }}>
          <label style={{ ...labelStyle, flex: "1 1 220px" }}>
            New key name
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. order-sync script"
              maxLength={60}
              style={inputStyle}
            />
          </label>
          <button type="submit" disabled={busy || !name.trim()} style={buttonStyle}>
            Create key
          </button>
        </form>
      )}

      {feedback && (
        <p style={{ marginTop: 12, fontSize: 13, color: feedback.kind === "ok" ? "var(--success)" : "var(--danger)" }}>
          {feedback.text}
        </p>
      )}
    </section>
  );
}

const codeStyle: React.CSSProperties = {
  fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
  fontSize: 12,
  background: "var(--code-bg, rgba(0,0,0,0.05))",
  padding: "1px 5px",
  borderRadius: 4,
};

const labelStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 6,
  fontSize: 13,
  color: "var(--muted)",
};

const sectionTitle: React.CSSProperties = {
  fontSize: 18,
  fontWeight: 600,
  margin: "0 0 14px",
  letterSpacing: "-0.01em",
  color: "var(--fg)",
};
