"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { buttonStyle, cardStyle, pageWrapStyle } from "../styles";

type State =
  | { kind: "working" }
  | { kind: "ok"; email: string }
  | { kind: "error"; message: string };

function ConfirmInner() {
  const params = useSearchParams();
  const token = params.get("token") ?? "";
  const [state, setState] = useState<State>({ kind: "working" });
  const ran = useRef(false); // confirm exactly once per mount

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;

    if (!token) {
      setState({ kind: "error", message: "This link is missing its token." });
      return;
    }
    (async () => {
      try {
        const res = await fetch("/api/auth/confirm-email", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token }),
        });
        const body = await res.json().catch(() => ({}));
        if (res.ok) {
          setState({ kind: "ok", email: body.email ?? "" });
        } else if (body.error === "email_taken") {
          setState({ kind: "error", message: "That email is now in use by another account." });
        } else {
          setState({ kind: "error", message: "This confirmation link is invalid or has expired." });
        }
      } catch {
        setState({ kind: "error", message: "Network error — please try again." });
      }
    })();
  }, [token]);

  return (
    <main style={pageWrapStyle}>
      <h1 style={{ fontSize: 28, fontWeight: 700, marginBottom: 6, letterSpacing: "-0.02em" }}>
        Confirm email change
      </h1>
      <div style={{ ...cardStyle, display: "flex", flexDirection: "column", gap: 14 }}>
        {state.kind === "working" && (
          <p style={{ color: "var(--muted)", margin: 0, fontSize: 15 }}>Confirming…</p>
        )}
        {state.kind === "ok" && (
          <>
            <p style={{ margin: 0, fontSize: 15 }}>
              Your email is now{" "}
              <strong style={{ color: "var(--fg)" }}>{state.email}</strong>. Sign in with it from now on.
            </p>
            <Link href="/login" style={{ ...buttonStyle, textAlign: "center", textDecoration: "none" }}>
              Go to sign in
            </Link>
          </>
        )}
        {state.kind === "error" && (
          <>
            <p style={{ color: "var(--danger)", margin: 0, fontSize: 15 }}>{state.message}</p>
            <Link href="/settings" style={{ ...buttonStyle, textAlign: "center", textDecoration: "none" }}>
              Back to settings
            </Link>
          </>
        )}
      </div>
    </main>
  );
}

export default function ConfirmEmailPage() {
  return (
    <Suspense>
      <ConfirmInner />
    </Suspense>
  );
}
