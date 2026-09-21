import { cardStyle } from "../styles";

// Placeholder shown while a lookup is in flight. Mirrors the result card's
// layout (header block + three timeline rows) so the page doesn't jump when
// the real data lands.
export function ResultSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading tracking result" style={{ ...cardStyle, padding: 0, overflow: "hidden" }}>
      <div style={{ padding: "20px 24px", borderBottom: "1px solid var(--border)" }}>
        <div className="skeleton" style={{ width: 120, height: 10, marginBottom: 10 }} />
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
          <div className="skeleton" style={{ width: 180, height: 20 }} />
          <div className="skeleton" style={{ width: 90, height: 24, borderRadius: 999 }} />
        </div>
      </div>
      <div style={{ padding: "16px 24px 20px", display: "flex", flexDirection: "column", gap: 22 }}>
        {[0, 1, 2].map((i) => (
          <div key={i} style={{ paddingLeft: 28, position: "relative" }}>
            <span className="skeleton" style={{ position: "absolute", left: 4, top: 4, width: 10, height: 10, borderRadius: "50%" }} />
            <div className="skeleton" style={{ width: i === 0 ? "60%" : "45%", height: 12, marginBottom: 8 }} />
            <div className="skeleton" style={{ width: "35%", height: 10 }} />
          </div>
        ))}
      </div>
    </div>
  );
}
