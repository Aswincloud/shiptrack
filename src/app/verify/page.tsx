"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { inputStyle, buttonStyle, buttonGhostStyle, cardStyle, pageWrapStyle } from "../styles";

function VerifyInner() {
  const router = useRouter();
  const params = useSearchParams();
  const email = params.get("email") ?? "";
  const [code, setCode] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [resending, setResending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  async function handle(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setInfo(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/auth/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, code }),
      });
      if (res.ok) {
        router.push("/dashboard");
        return;
      }
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Verification failed");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error");
    } finally {
      setSubmitting(false);
    }
  }

  async function resend() {
    setError(null);
    setInfo(null);
    setResending(true);
    try {
      const res = await fetch("/api/auth/resend-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      if (res.ok) setInfo("New code sent.");
      else {
        const body = await res.json().catch(() => ({}));
        setError(body.error === "cooldown" ? "Wait a minute before requesting another code." : "Couldn't resend.");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error");
    } finally {
      setResending(false);
    }
  }

  return (
    <main style={pageWrapStyle}>
      <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 4 }}>Verify your email</h1>
      <p style={{ color: "var(--muted)", margin: "0 0 24px" }}>
        We sent a 6-digit code to <strong style={{ color: "var(--fg)" }}>{email}</strong>.
      </p>
      <form onSubmit={handle} style={{ ...cardStyle, display: "flex", flexDirection: "column", gap: 12 }}>
        <input
          inputMode="numeric"
          pattern="\d{6}"
          maxLength={6}
          required
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
          placeholder="000000"
          style={{ ...inputStyle, fontSize: 24, letterSpacing: 6, textAlign: "center" }}
        />
        <button type="submit" disabled={submitting || code.length !== 6} style={buttonStyle}>
          {submitting ? "Verifying…" : "Verify"}
        </button>
        <button type="button" onClick={resend} disabled={resending} style={buttonGhostStyle}>
          {resending ? "Sending…" : "Resend code"}
        </button>
        {error && <div style={{ color: "#ff9b9b", fontSize: 13 }}>{error}</div>}
        {info && <div style={{ color: "#7cd992", fontSize: 13 }}>{info}</div>}
      </form>
    </main>
  );
}

export default function VerifyPage() {
  return (
    <Suspense>
      <VerifyInner />
    </Suspense>
  );
}
