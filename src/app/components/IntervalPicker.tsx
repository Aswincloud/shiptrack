"use client";

import { useState } from "react";
import { INTERVAL_PRESETS, inputStyle } from "../styles";

interface Props {
  value: number; // seconds
  onChange: (seconds: number) => void;
  style?: React.CSSProperties;
}

// Dropdown of preset intervals plus a "Custom (minutes)" option that reveals
// a numeric input. Picks the matching preset on first render based on `value`.
export function IntervalPicker({ value, onChange, style }: Props) {
  const matchedPreset = INTERVAL_PRESETS.find((p) => p.seconds === value);
  const initialMode: "preset" | "custom" = matchedPreset ? "preset" : "custom";
  const [mode, setMode] = useState<"preset" | "custom">(initialMode);
  const [customMinutes, setCustomMinutes] = useState<string>(
    matchedPreset ? "" : String(Math.max(15, Math.round(value / 60))),
  );

  function onPresetChange(v: string) {
    if (v === "custom") {
      setMode("custom");
      // Carry the current value into the input rather than resetting to blank.
      setCustomMinutes(String(Math.max(15, Math.round(value / 60))));
      return;
    }
    setMode("preset");
    onChange(Number(v));
  }

  function onCustomChange(v: string) {
    const cleaned = v.replace(/\D/g, "").slice(0, 4);
    setCustomMinutes(cleaned);
    const n = Number(cleaned);
    if (Number.isInteger(n) && n >= 15 && n <= 720) {
      onChange(n * 60);
    }
  }

  const presetSelect = (
    <select
      value={mode === "preset" ? String(value) : "custom"}
      onChange={(e) => onPresetChange(e.target.value)}
      style={{ ...inputStyle, ...style, fontSize: 13 }}
    >
      {INTERVAL_PRESETS.map((p) => (
        <option key={p.seconds} value={p.seconds}>{p.label}</option>
      ))}
      <option value="custom">Custom…</option>
    </select>
  );

  if (mode === "preset") return presetSelect;

  return (
    <div style={{ display: "flex", gap: 6, alignItems: "stretch", ...style }}>
      {presetSelect}
      <input
        inputMode="numeric"
        value={customMinutes}
        onChange={(e) => onCustomChange(e.target.value)}
        placeholder="min"
        style={{ ...inputStyle, width: 80, fontSize: 13 }}
        aria-label="Custom interval in minutes (15-720)"
      />
      <span style={{ alignSelf: "center", color: "var(--muted)", fontSize: 12 }}>min</span>
    </div>
  );
}
