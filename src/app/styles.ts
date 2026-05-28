import type { CSSProperties } from "react";

export const inputStyle: CSSProperties = {
  background: "var(--card)",
  color: "var(--fg)",
  border: "1px solid var(--border)",
  borderRadius: 8,
  padding: "10px 12px",
  fontSize: 14,
  transition: "border-color 0.15s, box-shadow 0.15s",
};

export const buttonStyle: CSSProperties = {
  background: "var(--accent)",
  color: "#fff",
  border: "none",
  borderRadius: 8,
  padding: "10px 18px",
  fontSize: 14,
  fontWeight: 500,
  cursor: "pointer",
  boxShadow: "var(--shadow)",
  transition: "background 0.15s",
};

export const buttonGhostStyle: CSSProperties = {
  background: "var(--card)",
  color: "var(--fg)",
  border: "1px solid var(--border)",
  borderRadius: 8,
  padding: "10px 18px",
  fontSize: 14,
  cursor: "pointer",
  transition: "background 0.15s, border-color 0.15s",
};

export const cardStyle: CSSProperties = {
  background: "var(--card)",
  border: "1px solid var(--border)",
  borderRadius: 12,
  padding: 20,
  boxShadow: "var(--shadow)",
};

export const pageWrapStyle: CSSProperties = {
  maxWidth: 480,
  margin: "0 auto",
  padding: "48px 20px",
};
