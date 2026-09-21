"use client";

import { useEffect, useState } from "react";
import { relativeTime } from "@/lib/dates";

// Renders "3 h ago" for a Date, refreshed each minute. Relative text depends
// on the viewer's clock, so it is only computed after mount — the server
// renders nothing here and hydration stays deterministic.
export function TimeAgo({ date, prefix = "", style }: { date: Date; prefix?: string; style?: React.CSSProperties }) {
  const [text, setText] = useState<string | null>(null);
  useEffect(() => {
    const tick = () => setText(relativeTime(date));
    const id = window.setTimeout(tick, 0);
    const iv = window.setInterval(tick, 60_000);
    return () => {
      window.clearTimeout(id);
      window.clearInterval(iv);
    };
  }, [date]);
  if (!text) return null;
  return (
    <span style={style} title={date.toISOString()}>
      {prefix}
      {text}
    </span>
  );
}
