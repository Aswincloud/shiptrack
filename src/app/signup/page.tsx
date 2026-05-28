"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { inputStyle, buttonStyle, cardStyle, pageWrapStyle } from "../styles";

export default function SignupPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handle(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      if (res.status === 202) {
        router.push(`/verify?email=${encodeURIComponent(email)}`);
        return;
      }
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Signup failed");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main style={pageWrapStyle}>
      <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 4 }}>Create account</h1>
      <p style={{ color: "var(--muted)", margin: "0 0 24px" }}>
        Sign up to track shipments and get alerts.
      </p>
      <form onSubmit={handle} style={{ ...cardStyle, display: "flex", flexDirection: "column", gap: 12 }}>
        <label style={labelStyle}>
          Email
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            style={inputStyle}
            autoComplete="email"
          />
        </label>
        <label style={labelStyle}>
          Password
          <input
            type="password"
            required
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            style={inputStyle}
            autoComplete="new-password"
          />
          <span style={{ color: "var(--muted)", fontSize: 12 }}>At least 8 characters.</span>
        </label>
        <button type="submit" disabled={submitting} style={buttonStyle}>
          {submitting ? "Creating…" : "Create account"}
        </button>
        {error && <div style={{ color: "var(--danger)", fontSize: 13 }}>{error}</div>}
      </form>
      <p style={{ marginTop: 16, color: "var(--muted)", fontSize: 14 }}>
        Already have an account? <Link href="/login">Sign in</Link>
      </p>
    </main>
  );
}

const labelStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 6,
  fontSize: 13,
  color: "var(--muted)",
};
