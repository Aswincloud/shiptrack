"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { buttonGhostStyle, cardStyle } from "../styles";
import type { ClientWatch, AdminUser } from "./components/types";
import { AddWatchModal } from "./components/AddWatchModal";
import { HistoryModal } from "./components/HistoryModal";
import { WatchTable } from "./components/WatchTable";
import { AdminSection } from "./components/AdminSection";

export function DashboardClient({
  email,
  initialWatches,
  isAdmin,
  adminUsers,
}: {
  email: string;
  initialWatches: ClientWatch[];
  isAdmin: boolean;
  adminUsers: AdminUser[] | null;
}) {
  const router = useRouter();
  const [watches, setWatches] = useState<ClientWatch[]>(initialWatches);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [viewing, setViewing] = useState<ClientWatch | null>(null);
  const [showDone, setShowDone] = useState(false);
  const [showAdd, setShowAdd] = useState(false);

  // Active (pending/active) shipments stay in the main list; finished ones
  // (completed/cancelled) drop into the collapsed "Delivered" section.
  const activeWatches = watches.filter((w) => w.status === "pending" || w.status === "active");
  const doneWatches = watches.filter((w) => w.status === "completed" || w.status === "cancelled");

  async function cancelWatch(id: string) {
    if (!confirm("Stop alerts for this shipment?")) return;
    const res = await fetch(`/api/watches/${encodeURIComponent(id)}`, { method: "DELETE" });
    if (res.ok) {
      setWatches((ws) => ws.map((w) => (w.id === id ? { ...w, status: "cancelled" } : w)));
    }
  }

  return (
    <main style={{ maxWidth: 960, margin: "0 auto", padding: "48px 24px" }}>
      <header
        style={{
          ...cardStyle,
          padding: "24px 28px",
          marginBottom: 24,
          background: "linear-gradient(135deg, #ffffff 0%, var(--accent-soft) 100%)",
          borderColor: "var(--accent-soft)",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 16,
          flexWrap: "wrap",
        }}
      >
        <div>
          <div style={{ fontSize: 12, color: "var(--muted)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 4 }}>
            Dashboard
          </div>
          <h1 style={{ fontSize: 24, fontWeight: 700, margin: 0, letterSpacing: "-0.02em" }}>
            Welcome back
          </h1>
          <p style={{ color: "var(--muted)", margin: "4px 0 0", fontSize: 14 }}>{email}</p>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button
            type="button"
            onClick={() => setShowAdd(true)}
            style={{ ...buttonGhostStyle, padding: "10px 16px", fontSize: 14, fontWeight: 600 }}
          >
            + Watch an AWB
          </button>
          <Link
            href="/"
            style={{
              padding: "10px 18px",
              borderRadius: 10,
              background: "var(--accent-gradient)",
              color: "#fff",
              textDecoration: "none",
              fontSize: 14,
              fontWeight: 600,
              boxShadow: "var(--shadow-md)",
            }}
          >
            Track a shipment
          </Link>
        </div>
      </header>

      <section style={{ marginBottom: 32 }}>
        <h2 style={sectionTitle}>
          Your watches <span style={countBadge}>{activeWatches.length}</span>
        </h2>
        {watches.length === 0 ? (
          <div style={{ ...cardStyle, textAlign: "center", padding: "48px 24px" }}>
            <div style={{ fontSize: 28, marginBottom: 8 }}>📦</div>
            <div style={{ fontWeight: 600, marginBottom: 4 }}>No watches yet</div>
            <div style={{ color: "var(--muted)", fontSize: 14 }}>
              <Link href="/">Track a shipment</Link> and click &ldquo;Notify me on changes&rdquo; to add one.
            </div>
          </div>
        ) : activeWatches.length === 0 ? (
          <div style={{ ...cardStyle, textAlign: "center", padding: "32px 24px" }}>
            <div style={{ fontWeight: 600, marginBottom: 4 }}>All caught up 🎉</div>
            <div style={{ color: "var(--muted)", fontSize: 14 }}>
              No active shipments. Delivered ones are below.
            </div>
          </div>
        ) : (
          <WatchTable
            watches={activeWatches}
            editingId={editingId}
            setEditingId={setEditingId}
            setWatches={setWatches}
            cancelWatch={cancelWatch}
            setViewing={setViewing}
          />
        )}
      </section>

      {doneWatches.length > 0 && (
        <section style={{ marginBottom: 32 }}>
          <button
            type="button"
            onClick={() => setShowDone((s) => !s)}
            style={{
              ...sectionTitle,
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              background: "none",
              border: "none",
              cursor: "pointer",
              padding: 0,
            }}
            aria-expanded={showDone}
          >
            <span style={{ transition: "transform 0.15s", transform: showDone ? "rotate(90deg)" : "none" }}>▸</span>
            Delivered <span style={countBadge}>{doneWatches.length}</span>
          </button>
          {showDone && (
            <div style={{ marginTop: 12 }}>
              <WatchTable
                watches={doneWatches}
                editingId={editingId}
                setEditingId={setEditingId}
                setWatches={setWatches}
                cancelWatch={cancelWatch}
                setViewing={setViewing}
              />
            </div>
          )}
        </section>
      )}

      {isAdmin && adminUsers && (
        <section>
          <AdminSection initialUsers={adminUsers} currentUserId={undefined} />
        </section>
      )}

      <div style={{ marginTop: 40, textAlign: "center" }}>
        <button
          type="button"
          style={{ ...buttonGhostStyle, padding: "8px 16px", fontSize: 13 }}
          onClick={async () => {
            await fetch("/api/auth/logout", { method: "POST" });
            router.push("/");
          }}
        >
          Sign out
        </button>
      </div>

      {viewing && <HistoryModal watch={viewing} onClose={() => setViewing(null)} />}
      {showAdd && (
        <AddWatchModal
          defaultEmail={email}
          onClose={() => setShowAdd(false)}
          onAdded={(w) => {
            setWatches((ws) => [w, ...ws]);
            setShowAdd(false);
          }}
        />
      )}
    </main>
  );
}

const sectionTitle: React.CSSProperties = {
  fontSize: 13,
  fontWeight: 600,
  color: "var(--muted)",
  textTransform: "uppercase",
  letterSpacing: "0.08em",
  margin: "0 0 12px",
  display: "flex",
  alignItems: "center",
  gap: 8,
};

const countBadge: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  minWidth: 20,
  height: 20,
  padding: "0 6px",
  borderRadius: 999,
  background: "var(--accent-soft)",
  color: "var(--accent)",
  fontSize: 11,
  fontWeight: 700,
};
