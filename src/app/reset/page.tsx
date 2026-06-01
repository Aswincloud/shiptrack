"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { inputStyle, buttonStyle, cardStyle, pageWrapStyle } from "../styles";
import { PasswordStrength } from "../components/PasswordStrength";

function ResetInner() {
  const router = useRouter();
  const params = useSearchParams();
  const token = params.get("token") ?? "";
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function handle(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/auth/reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      if (res.ok) {
        setDone(true);
        setTimeout(() => router.push("/login"), 1500);
        return;
      }
      const body = await res.json().catch(() => ({}));
      setError(body.error === "invalid_token" ? "This link is invalid or has expired." : (body.error ?? "Reset failed"));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error");
    } finally {
      setSubmitting(false);
    }
  }

  if (!token) {
    return (
      <main style={pageWrapStyle}>
        <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 4 }}>Reset password</h1>
        <div style={cardStyle}>
          <p style={{ margin: 0 }}>Missing token. <Link href="/forgot">Request a new reset link</Link>.</p>
        </div>
      </main>
    );
  }

  return (
    <main style={pageWrapStyle}>
      <h1 style={{ fontSize: 28, fontWeight: 700, marginBottom: 6, letterSpacing: "-0.02em" }}>Reset password</h1>
      <p style={{ color: "var(--muted)", margin: "0 0 28px", fontSize: 15 }}>Choose a new password.</p>
      {done ? (
        <div style={cardStyle}>
          <p style={{ margin: 0 }}>Password updated. Redirecting to sign in…</p>
        </div>
      ) : (
        <form onSubmit={handle} style={{ ...cardStyle, display: "flex", flexDirection: "column", gap: 12 }}>
          <div>
            <input
              type="password"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="New password"
              style={{ ...inputStyle, width: "100%" }}
              autoComplete="new-password"
            />
            <PasswordStrength password={password} />
          </div>
          <button type="submit" disabled={submitting} style={buttonStyle}>
            {submitting ? "Saving…" : "Update password"}
          </button>
          {error && <div style={{ color: "var(--danger)", fontSize: 13 }}>{error}</div>}
        </form>
      )}
    </main>
  );
}

export default function ResetPage() {
  return (
    <Suspense>
      <ResetInner />
    </Suspense>
  );
}
