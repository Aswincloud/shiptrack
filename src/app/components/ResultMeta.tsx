import type { TrackingEvent } from "@/carriers/types";
import { displayCarrierDate } from "@/lib/dates";
import { TimeAgo } from "./TimeAgo";

// The two lines under the waybill: when the newest scan happened (normalised,
// with a live "x ago"), and the carrier's expected delivery date. Shared by
// the home result card and the public /track page.
export function ResultMeta({ events, estimatedDelivery }: { events: TrackingEvent[]; estimatedDelivery?: string }) {
  const latest = events[events.length - 1];
  const when = latest ? displayCarrierDate(latest.timestamp) : null;
  const eta = displayCarrierDate(estimatedDelivery);
  const etaText = eta.date
    ? // ETAs are dates, sometimes with a meaningless midnight/2:30 PM time; show the day only.
      eta.text.replace(/,\s[^,]*IST$/, "")
    : eta.text;

  return (
    <>
      {when && when.text && (
        <div style={{ marginTop: 10, fontSize: 13, color: "var(--muted)", display: "flex", gap: 6, flexWrap: "wrap" }}>
          <span>Latest scan:</span>
          <strong style={{ color: "var(--fg)", fontWeight: 500 }}>{when.text}</strong>
          {when.date && <TimeAgo date={when.date} prefix="· " style={{ color: "var(--accent)", fontWeight: 500 }} />}
        </div>
      )}
      {etaText && (
        <div style={{ marginTop: 6, fontSize: 13, color: "var(--muted)" }}>
          Expected delivery: <strong style={{ color: "var(--fg)" }}>{etaText}</strong>
        </div>
      )}
    </>
  );
}
