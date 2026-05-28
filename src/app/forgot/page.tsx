"use client";

import { useState } from "react";
import Link from "next/link";
import { inputStyle, buttonStyle, cardStyle, pageWrapStyle } from "../styles";

export default function ForgotPage() {
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);

  async function handle(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      await fetch("/api/auth/forgot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      setSent(true);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main style={pageWrapStyle}>
      <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 4 }}>Forgot password</h1>
      <p style={{ color: "var(--muted)", margin: "0 0 24px" }}>
        Enter your account email — we&apos;ll send a reset link.
      </p>
      {sent ? (
        <div style={cardStyle}>
          <p style={{ margin: 0 }}>If that email is registered, a reset link is on its way.</p>
          <p style={{ marginTop: 16 }}><Link href="/login">Back to sign in</Link></p>
        </div>
      ) : (
        <form onSubmit={handle} style={{ ...cardStyle, display: "flex", flexDirection: "column", gap: 12 }}>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            style={inputStyle}
          />
          <button type="submit" disabled={submitting} style={buttonStyle}>
            {submitting ? "Sending…" : "Send reset link"}
          </button>
        </form>
      )}
    </main>
  );
}
