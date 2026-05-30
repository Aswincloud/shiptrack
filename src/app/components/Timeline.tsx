import type { TrackingEvent } from "@/carriers/types";

// Vertical connected timeline of scan events, newest first. Shared by the
// home-page tracking result and the dashboard "full history" modal so they
// render identically.
export function Timeline({ events }: { events: TrackingEvent[] }) {
  if (events.length === 0) {
    return (
      <div style={{ color: "var(--muted)", fontSize: 14, padding: "8px 0" }}>
        No tracking events yet.
      </div>
    );
  }
  // Caller passes events oldest-first (events[last] = latest); show newest first.
  const ordered = events.slice().reverse();
  return (
    <ol style={{ margin: 0, padding: 0, listStyle: "none" }}>
      {ordered.map((ev, i, arr) => (
        <li key={i} style={{ position: "relative", paddingLeft: 28, paddingBlock: 14 }}>
          <span
            aria-hidden
            style={{
              position: "absolute",
              left: 4,
              top: 18,
              width: 10,
              height: 10,
              borderRadius: "50%",
              background: i === 0 ? "var(--accent)" : "var(--card)",
              border: `2px solid ${i === 0 ? "var(--accent)" : "var(--border-strong)"}`,
              boxShadow: i === 0 ? "0 0 0 4px rgba(99,102,241,0.15)" : "none",
              zIndex: 1,
            }}
          />
          {i < arr.length - 1 && (
            <span
              aria-hidden
              style={{
                position: "absolute",
                left: 8,
                top: 26,
                bottom: -14,
                width: 2,
                background: "var(--border)",
              }}
            />
          )}
          <div style={{ fontSize: 14, fontWeight: 500, color: "var(--fg)" }}>{ev.description}</div>
          <div style={{ color: "var(--muted)", fontSize: 12, marginTop: 4, display: "flex", gap: 8, flexWrap: "wrap" }}>
            <span>{ev.timestamp}</span>
            {ev.location && (
              <>
                <span style={{ color: "var(--muted-soft)" }}>·</span>
                <span>{ev.location}</span>
              </>
            )}
          </div>
        </li>
      ))}
    </ol>
  );
}
