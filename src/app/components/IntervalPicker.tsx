"use client";

import { useState } from "react";
import { INTERVAL_PRESETS, inputStyle } from "../styles";

interface Props {
  value: number; // seconds
  onChange: (seconds: number) => void;
  style?: React.CSSProperties;
}

// Snap a stored interval to a preset when it's effectively one of them. Older
// watches were created with the legacy 840s ("14 min") default, which isn't a
// literal preset; treat anything within 60s of a preset as that preset so the
// picker opens as a clean dropdown instead of falling into Custom mode.
function snapToPreset(seconds: number): number {
  const near = INTERVAL_PRESETS.find((p) => Math.abs(p.seconds - seconds) <= 60);
  return near ? near.seconds : seconds;
}

// Dropdown of preset intervals plus a "Custom (minutes)" option that reveals
// a numeric input. Picks the matching preset on first render based on `value`.
export function IntervalPicker({ value, onChange, style }: Props) {
  const snapped = snapToPreset(value);
  const matchedPreset = INTERVAL_PRESETS.find((p) => p.seconds === snapped);
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
      value={mode === "preset" ? String(snapped) : "custom"}
      onChange={(e) => onPresetChange(e.target.value)}
      style={{ ...inputStyle, minWidth: 0, fontSize: 13, ...style }}
    >
      {INTERVAL_PRESETS.map((p) => (
        <option key={p.seconds} value={p.seconds}>{p.label}</option>
      ))}
      <option value="custom">Custom…</option>
    </select>
  );

  if (mode === "preset") return presetSelect;

  return (
    <div style={{ display: "flex", gap: 6, alignItems: "stretch", flexWrap: "wrap", minWidth: 0, ...style }}>
      {presetSelect}
      <input
        inputMode="numeric"
        value={customMinutes}
        onChange={(e) => onCustomChange(e.target.value)}
        placeholder="min"
        style={{ ...inputStyle, width: 64, minWidth: 0, fontSize: 13 }}
        aria-label="Custom interval in minutes (15-720)"
      />
      <span style={{ alignSelf: "center", color: "var(--muted)", fontSize: 12 }}>min</span>
    </div>
  );
}
