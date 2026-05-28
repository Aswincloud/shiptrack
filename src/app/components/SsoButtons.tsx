"use client";

import { useEffect, useState } from "react";

type Provider = "google" | "github" | "microsoft";

const PROVIDER_LABEL: Record<Provider, string> = {
  google: "Google",
  github: "GitHub",
  microsoft: "Microsoft",
};

function ProviderIcon({ p }: { p: Provider }) {
  if (p === "google") {
    return (
      <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden>
        <path fill="#EA4335" d="M9 3.48c1.69 0 2.83.73 3.48 1.34l2.54-2.48C13.46.89 11.43 0 9 0 5.48 0 2.44 2.02.96 4.96l2.91 2.26C4.6 5.05 6.62 3.48 9 3.48z" />
        <path fill="#4285F4" d="M17.64 9.2c0-.74-.06-1.28-.19-1.84H9v3.34h4.96c-.1.83-.64 2.08-1.84 2.92l2.84 2.2c1.7-1.57 2.68-3.88 2.68-6.62z" />
        <path fill="#FBBC05" d="M3.88 10.78A5.54 5.54 0 0 1 3.58 9c0-.62.11-1.22.29-1.78L.96 4.96A9 9 0 0 0 0 9c0 1.45.35 2.82.96 4.04l2.92-2.26z" />
        <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.84-2.2c-.76.53-1.78.9-3.12.9-2.38 0-4.4-1.57-5.12-3.74L.97 13.04C2.45 15.98 5.48 18 9 18z" />
        <path fill="none" d="M0 0h18v18H0z" />
      </svg>
    );
  }
  if (p === "github") {
    return (
      <svg width="18" height="18" viewBox="0 0 16 16" fill="#24292f" aria-hidden>
        <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.69-.01-1.36-2.22.48-2.69-1.07-2.69-1.07-.36-.92-.89-1.17-.89-1.17-.73-.5.06-.49.06-.49.8.06 1.23.83 1.23.83.72 1.23 1.88.88 2.34.67.07-.52.28-.88.51-1.08-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.22 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.19 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8z" />
      </svg>
    );
  }
  // microsoft
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden>
      <path fill="#F25022" d="M0 0h8.5v8.5H0z" />
      <path fill="#7FBA00" d="M9.5 0H18v8.5H9.5z" />
      <path fill="#00A4EF" d="M0 9.5h8.5V18H0z" />
      <path fill="#FFB900" d="M9.5 9.5H18V18H9.5z" />
    </svg>
  );
}

export function SsoButtons({ verb = "Sign in" }: { verb?: string }) {
  const [providers, setProviders] = useState<Provider[] | null>(null);

  useEffect(() => {
    fetch("/api/auth/oauth/providers")
      .then((r) => r.json())
      .then((b: { providers: Provider[] }) => setProviders(b.providers))
      .catch(() => setProviders([]));
  }, []);

  if (providers === null) return null;
  if (providers.length === 0) return null;

  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {providers.map((p) => (
          <a
            key={p}
            href={`/api/auth/oauth/${p}/start`}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 10,
              padding: "11px 16px",
              border: "1px solid var(--border)",
              borderRadius: 10,
              background: "var(--card)",
              color: "var(--fg-soft)",
              fontWeight: 500,
              fontSize: 14,
              textDecoration: "none",
              boxShadow: "var(--shadow-sm)",
              transition: "border-color 0.15s, background 0.15s",
            }}
          >
            <ProviderIcon p={p} />
            <span>
              {verb} with {PROVIDER_LABEL[p]}
            </span>
          </a>
        ))}
      </div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          margin: "20px 0",
          color: "var(--muted)",
          fontSize: 12,
          textTransform: "uppercase",
          letterSpacing: "0.08em",
        }}
      >
        <span style={{ flex: 1, height: 1, background: "var(--border)" }} />
        <span>or</span>
        <span style={{ flex: 1, height: 1, background: "var(--border)" }} />
      </div>
    </div>
  );
}
