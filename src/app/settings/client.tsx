"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { inputStyle, buttonStyle, buttonGhostStyle, cardStyle, pageWrapStyle } from "../styles";
import { PasswordStrength } from "../components/PasswordStrength";

interface PendingEmailChange {
  id: string;
  requestedEmail: string;
  createdAt: number;
}

interface Props {
  email: string;
  name: string | null;
  isAdmin: boolean;
  hasPassword: boolean;
  createdAt: number;
  initialPendingEmailChange: PendingEmailChange | null;
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
        initialPendingEmailChange={props.initialPendingEmailChange}
      />
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
  initialPendingEmailChange,
}: {
  email: string;
  initialName: string | null;
  createdAt: number;
  isAdmin: boolean;
  initialPendingEmailChange: PendingEmailChange | null;
}) {
  const [name, setName] = useState(initialName ?? "");
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  // Email-change request state, hydrated from the server snapshot.
  const [pending, setPending] = useState<PendingEmailChange | null>(initialPendingEmailChange);
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
      body: JSON.stringify({ requestedEmail: target }),
    });
    setEmailSubmitting(false);
    if (res.ok) {
      // Re-fetch our snapshot so we show the new pending state.
      const me = await fetch("/api/auth/email-change-requests").then((r) => r.json()).catch(() => null);
      if (me?.pending) {
        setPending({
          id: me.pending.id,
          requestedEmail: me.pending.requested_email,
          createdAt: me.pending.created_at,
        });
      }
      setShowEmailForm(false);
      setRequestedEmail("");
      setEmailFeedback({ kind: "ok", text: "Request sent. An admin will review it." });
      return;
    }
    const j = await res.json().catch(() => ({}));
    const msg =
      j.error === "same_as_current"
        ? "That's already your current email."
        : j.error === "email_taken"
          ? "That email is already in use by another account."
          : j.error === "already_pending"
            ? "You already have a pending request."
            : "Couldn't submit request.";
    setEmailFeedback({ kind: "err", text: msg });
  }

  async function cancelEmailRequest() {
    if (!pending) return;
    if (!confirm("Cancel your pending email change request?")) return;
    const res = await fetch(`/api/auth/email-change-requests/${encodeURIComponent(pending.id)}`, { method: "DELETE" });
    if (res.ok) {
      setPending(null);
      setEmailFeedback({ kind: "ok", text: "Request cancelled." });
    } else {
      setEmailFeedback({ kind: "err", text: "Couldn't cancel — refresh and try again." });
    }
  }

  return (
    <section style={{ ...cardStyle, marginBottom: 20 }}>
      <h2 style={sectionTitle}>Profile</h2>
      <form onSubmit={save} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <label style={labelStyle}>
          Email
          <input value={email} disabled style={{ ...inputStyle, opacity: 0.7 }} />
          {pending ? (
            <div
              style={{
                marginTop: 8,
                padding: "10px 12px",
                background: "var(--warning-bg, #fffbeb)",
                border: "1px solid var(--warning-border, #fde68a)",
                borderRadius: 8,
                fontSize: 13,
                color: "var(--fg-soft)",
                display: "flex",
                gap: 10,
                alignItems: "flex-start",
                flexWrap: "wrap",
              }}
            >
              <div style={{ flex: 1, minWidth: 200 }}>
                <strong>Pending email change.</strong> An admin will review your request to switch to{" "}
                <strong>{pending.requestedEmail}</strong> (submitted {new Date(pending.createdAt * 1000).toLocaleDateString()}).
              </div>
              <button
                type="button"
                onClick={cancelEmailRequest}
                style={{ ...buttonGhostStyle, padding: "6px 12px", fontSize: 12, color: "var(--danger)", borderColor: "var(--danger-border)" }}
              >
                Cancel request
              </button>
            </div>
          ) : !showEmailForm ? (
            <button
              type="button"
              onClick={() => setShowEmailForm(true)}
              style={{ ...buttonGhostStyle, padding: "6px 12px", fontSize: 12, marginTop: 6, alignSelf: "flex-start" }}
            >
              Request email change
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
                  An admin will review your request and you&apos;ll receive an email with the decision.
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <button
                    type="submit"
                    disabled={emailSubmitting || !requestedEmail.trim()}
                    style={{ ...buttonStyle, padding: "8px 14px", fontSize: 13 }}
                  >
                    {emailSubmitting ? "Sending…" : "Submit request"}
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
        </label>
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
