import type { ReactNode } from "react";

export function PolicyLayout({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
}) {
  return (
    <main style={{ maxWidth: 720, margin: "0 auto", padding: "64px 24px" }}>
      <header style={{ marginBottom: 32 }}>
        <h1 style={{ fontSize: 32, fontWeight: 700, margin: "0 0 8px", letterSpacing: "-0.02em" }}>{title}</h1>
        {subtitle && <p style={{ color: "var(--muted)", margin: 0, fontSize: 15 }}>{subtitle}</p>}
      </header>
      <article style={{ color: "var(--fg-soft)", lineHeight: 1.7, fontSize: 15 }}>{children}</article>
    </main>
  );
}

export const h2Style: React.CSSProperties = {
  fontSize: 18,
  fontWeight: 600,
  marginTop: 32,
  marginBottom: 8,
  letterSpacing: "-0.01em",
  color: "var(--fg)",
};

export const pStyle: React.CSSProperties = { margin: "0 0 12px" };
