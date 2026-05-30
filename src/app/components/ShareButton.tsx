"use client";

import { useState } from "react";
import { buttonGhostStyle } from "../styles";

// Share the current page (or an explicit url). Uses the native share sheet
// where available (mobile), otherwise copies the link to the clipboard and
// shows a brief "Copied!" confirmation.
export function ShareButton({
  url,
  title,
  text,
  label = "Share",
  style,
}: {
  url?: string;
  title?: string;
  text?: string;
  label?: string;
  style?: React.CSSProperties;
}) {
  const [copied, setCopied] = useState(false);

  async function handle() {
    const shareUrl = url ?? (typeof window !== "undefined" ? window.location.href : "");
    if (!shareUrl) return;

    // Native share sheet (mobile / some desktop browsers).
    const nav = typeof navigator !== "undefined" ? navigator : undefined;
    if (nav?.share) {
      try {
        await nav.share({ title, text, url: shareUrl });
        return;
      } catch {
        // User cancelled or share failed — fall through to copy.
      }
    }

    // Clipboard fallback.
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // Last resort: a prompt the user can copy from manually.
      if (typeof window !== "undefined") window.prompt("Copy this tracking link:", shareUrl);
    }
  }

  return (
    <button
      type="button"
      onClick={handle}
      style={{ ...buttonGhostStyle, padding: "8px 16px", fontSize: 14, display: "inline-flex", alignItems: "center", gap: 8, ...style }}
    >
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <circle cx="18" cy="5" r="3" />
        <circle cx="6" cy="12" r="3" />
        <circle cx="18" cy="19" r="3" />
        <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
        <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
      </svg>
      {copied ? "Copied!" : label}
    </button>
  );
}
