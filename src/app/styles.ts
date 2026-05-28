import type { CSSProperties } from "react";

export const inputStyle: CSSProperties = {
  background: "var(--card)",
  color: "var(--fg)",
  border: "1px solid var(--border)",
  borderRadius: 10,
  padding: "11px 14px",
  fontSize: 14,
  transition: "border-color 0.15s, box-shadow 0.15s",
};

export const buttonStyle: CSSProperties = {
  background: "var(--accent-gradient)",
  color: "#fff",
  border: "none",
  borderRadius: 10,
  padding: "11px 20px",
  fontSize: 14,
  fontWeight: 600,
  cursor: "pointer",
  boxShadow: "var(--shadow-md)",
  transition: "transform 0.1s, box-shadow 0.15s, opacity 0.15s",
  letterSpacing: "-0.005em",
};

export const buttonGhostStyle: CSSProperties = {
  background: "var(--card)",
  color: "var(--fg-soft)",
  border: "1px solid var(--border)",
  borderRadius: 10,
  padding: "11px 20px",
  fontSize: 14,
  fontWeight: 500,
  cursor: "pointer",
  transition: "background 0.15s, border-color 0.15s",
};

export const cardStyle: CSSProperties = {
  background: "var(--card)",
  border: "1px solid var(--border)",
  borderRadius: 16,
  padding: 24,
  boxShadow: "var(--shadow)",
};

export const pageWrapStyle: CSSProperties = {
  maxWidth: 480,
  margin: "0 auto",
  padding: "64px 20px",
};

// Preset poll intervals shown in the UI. Custom values are also allowed
// (15-720 minutes) but these cover most use cases.
export const INTERVAL_PRESETS: { label: string; seconds: number }[] = [
  { label: "Every 15 minutes", seconds: 15 * 60 },
  { label: "Every 30 minutes", seconds: 30 * 60 },
  { label: "Every hour", seconds: 60 * 60 },
  { label: "Every 3 hours", seconds: 3 * 60 * 60 },
  { label: "Every 6 hours", seconds: 6 * 60 * 60 },
  { label: "Every 12 hours", seconds: 12 * 60 * 60 },
];

export function intervalLabel(seconds: number): string {
  const preset = INTERVAL_PRESETS.find((p) => p.seconds === seconds);
  if (preset) return preset.label;
  // The legacy default of 14 min lands here for old rows.
  if (seconds === 840) return "Every 15 minutes";
  const m = Math.round(seconds / 60);
  if (m < 60) return `Every ${m} min`;
  const h = Math.round((seconds / 3600) * 10) / 10;
  return `Every ${h} h`;
}

// Map our shipment status union to a semantic pill color.
export function statusPillStyle(status: string): CSSProperties {
  const s = status.toLowerCase();
  const palette =
    s === "delivered" ? { bg: "var(--success-bg)", border: "var(--success-border)", color: "var(--success)" } :
    s === "out_for_delivery" || s === "out for delivery" ? { bg: "var(--info-bg)", border: "var(--info-border)", color: "var(--info)" } :
    s === "exception" || s === "returned" || s === "cancelled" ? { bg: "var(--danger-bg)", border: "var(--danger-border)", color: "var(--danger)" } :
    s === "in_transit" || s === "in transit" || s === "picked_up" || s === "picked up" ? { bg: "var(--warning-bg)", border: "var(--warning-border)", color: "var(--warning)" } :
    { bg: "var(--neutral-bg)", border: "var(--border-strong)", color: "var(--muted)" };
  return {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    padding: "4px 10px",
    borderRadius: 999,
    fontSize: 12,
    fontWeight: 600,
    background: palette.bg,
    border: `1px solid ${palette.border}`,
    color: palette.color,
    textTransform: "capitalize",
    letterSpacing: "-0.005em",
  };
}
