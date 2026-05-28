"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { inputStyle, buttonStyle, cardStyle, pageWrapStyle } from "../styles";

export default function LoginPage() {
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
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      if (res.ok) {
        router.push("/dashboard");
        return;
      }
      if (res.status === 403) {
        const body = await res.json().catch(() => ({}));
        if (body.requiresVerification) {
          router.push(`/verify?email=${encodeURIComponent(email)}`);
          return;
        }
      }
      const body = await res.json().catch(() => ({}));
      setError(body.error === "invalid_credentials" ? "Wrong email or password." : (body.error ?? "Login failed"));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main style={pageWrapStyle}>
      <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 4 }}>Sign in</h1>
      <p style={{ color: "var(--muted)", margin: "0 0 24px" }}>Welcome back.</p>
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
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            style={inputStyle}
            autoComplete="current-password"
          />
        </label>
        <button type="submit" disabled={submitting} style={buttonStyle}>
          {submitting ? "Signing in…" : "Sign in"}
        </button>
        {error && <div style={{ color: "var(--danger)", fontSize: 13 }}>{error}</div>}
      </form>
      <p style={{ marginTop: 16, color: "var(--muted)", fontSize: 14, display: "flex", justifyContent: "space-between" }}>
        <Link href="/signup">Create account</Link>
        <Link href="/forgot">Forgot password?</Link>
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
