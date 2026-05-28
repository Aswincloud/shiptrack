"use client";

import { Suspense, useEffect, useRef, useState } from "react";
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
  const submittedFor = useRef<string | null>(null); // dedupe: prevent double-submit for the same code
  const inputRef = useRef<HTMLInputElement>(null);

  async function submit(value: string) {
    if (value.length !== 6) return;
    if (submittedFor.current === value) return;
    submittedFor.current = value;
    setError(null);
    setInfo(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/auth/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, code: value }),
      });
      if (res.ok) {
        router.push("/dashboard");
        return;
      }
      const body = await res.json().catch(() => ({}));
      const errCode = body.error as string | undefined;
      if (errCode === "invalid_code") {
        setError("That code didn't match. Try again.");
        setCode("");
        inputRef.current?.focus();
      } else if (errCode === "expired") {
        setError("That code has expired. Tap “Resend code”.");
        setCode("");
      } else if (errCode === "too_many_attempts") {
        setError("Too many attempts. Tap “Resend code” for a new one.");
        setCode("");
      } else {
        setError(errCode ?? "Verification failed");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error");
      setCode("");
    } finally {
      setSubmitting(false);
    }
  }

  // Reset the dedupe key whenever the input shrinks below 6 — that means the
  // user cleared or backspaced after a failed attempt, so a fresh 6 digits
  // (even if identical) should re-submit.
  useEffect(() => {
    if (code.length < 6) submittedFor.current = null;
  }, [code]);

  // Auto-submit as soon as 6 digits are entered.
  useEffect(() => {
    if (code.length === 6 && !submitting) submit(code);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code]);

  async function handleForm(e: React.FormEvent) {
    e.preventDefault();
    await submit(code);
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
      <h1 style={{ fontSize: 28, fontWeight: 700, marginBottom: 6, letterSpacing: "-0.02em" }}>Verify your email</h1>
      <p style={{ color: "var(--muted)", margin: "0 0 28px", fontSize: 15 }}>
        We sent a 6-digit code to <strong style={{ color: "var(--fg)" }}>{email}</strong>.
      </p>
      <form onSubmit={handleForm} style={{ ...cardStyle, display: "flex", flexDirection: "column", gap: 12 }}>
        <input
          ref={inputRef}
          inputMode="numeric"
          pattern="\d{6}"
          maxLength={6}
          required
          autoFocus
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
          placeholder="000000"
          style={{ ...inputStyle, fontSize: 24, letterSpacing: 6, textAlign: "center" }}
        />
        <button type="submit" disabled={submitting || code.length !== 6} style={buttonStyle}>
          {submitting ? "Verifying…" : "Verify"}
        </button>
        <button type="button" onClick={resend} disabled={resending} style={buttonGhostStyle}>
          {resending ? "Sending…" : "Resend code"}
        </button>
        {error && <div style={{ color: "var(--danger)", fontSize: 13 }}>{error}</div>}
        {info && <div style={{ color: "var(--success)", fontSize: 13 }}>{info}</div>}
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
