"use client";

import { useState } from "react";
import Link from "next/link";
import { buttonGhostStyle, cardStyle, statusPillStyle } from "../../styles";
import { humanStatus } from "@/lib/status";
import { formatPhoneForDisplay } from "@/lib/whatsapp";
import type { AdminWatchRequest } from "./types";
import { th, td } from "./tableStyles";

const CARRIER_LABELS: Record<string, string> = {
  bluedart: "Blue Dart",
  shiprocket: "Shiprocket",
  delhivery: "Delhivery",
  stcourier: "ST Courier",
  tpc: "Professional Couriers",
  amazon: "Amazon Shipping",
};

// How a watch request is doing, in the operator's terms rather than the
// database's: "pending" means the visitor hasn't clicked their link (email)
// or sent their VERIFY message (WhatsApp) yet.
const REQUEST_STATE: Record<string, { label: string; color: string }> = {
  pending: { label: "Awaiting confirmation", color: "var(--warning)" },
  active: { label: "Confirmed", color: "var(--success)" },
  completed: { label: "Delivered", color: "var(--muted)" },
  cancelled: { label: "Cancelled", color: "var(--muted)" },
};

export function AdminWatchRequests({ initialRequests }: { initialRequests: AdminWatchRequest[] }) {
  const [requests, setRequests] = useState<AdminWatchRequest[]>(initialRequests);
  const [refreshing, setRefreshing] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [showHidden, setShowHidden] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    setRefreshing(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/watches");
      if (!res.ok) throw new Error("failed");
      const body = await res.json();
      setRequests(body.watches);
    } catch {
      setError("Couldn't refresh watch requests.");
    } finally {
      setRefreshing(false);
    }
  }

  // Hiding is a list-tidying action only — cancelled requests are never purged,
  // so without it a request from months ago sits at the bottom forever. It
  // changes nothing about the watch itself; an active one is still polled.
  async function setHidden(id: string, hidden: boolean) {
    const before = requests;
    setBusyId(id);
    setError(null);
    setRequests((rs) => rs.map((r) => (r.id === id ? { ...r, admin_hidden_at: hidden ? Math.floor(Date.now() / 1000) : null } : r)));
    try {
      const res = await fetch(`/api/admin/watches/${encodeURIComponent(id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hidden }),
      });
      if (!res.ok) throw new Error("failed");
    } catch {
      setRequests(before);
      setError(hidden ? "Couldn't hide that request." : "Couldn't unhide that request.");
    } finally {
      setBusyId(null);
    }
  }

  const visible = requests.filter((r) => !r.admin_hidden_at);
  const hidden = requests.filter((r) => r.admin_hidden_at);
  const awaiting = visible.filter((r) => r.status === "pending").length;

  return (
    <div style={{ marginTop: 32 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "0 0 12px", flexWrap: "wrap" }}>
        <h2 style={{ fontSize: 16, fontWeight: 600, margin: 0 }}>
          Guest watch requests ({visible.length})
        </h2>
        {awaiting > 0 && (
          <span style={{ fontSize: 12, color: "var(--warning)", fontWeight: 600 }}>
            {awaiting} awaiting confirmation
          </span>
        )}
        <button
          type="button"
          onClick={refresh}
          disabled={refreshing}
          style={{ ...buttonGhostStyle, padding: "6px 12px", fontSize: 12, marginLeft: "auto" }}
        >
          {refreshing ? "Refreshing…" : "Refresh"}
        </button>
      </div>

      {requests.length === 0 ? (
        <div style={{ ...cardStyle, padding: "24px", color: "var(--muted)", fontSize: 14 }}>
          Nobody has asked to be alerted without an account yet. Requests made from a shared
          track page show up here.
        </div>
      ) : visible.length === 0 ? (
        <div style={{ ...cardStyle, padding: "24px", color: "var(--muted)", fontSize: 14 }}>
          Every request is hidden. Expand the list below to see them.
        </div>
      ) : (
        <RequestsTable rows={visible} busyId={busyId} action="hide" onAction={(id) => setHidden(id, true)} />
      )}

      {hidden.length > 0 && (
        <div style={{ marginTop: 16 }}>
          <button
            type="button"
            onClick={() => setShowHidden((s) => !s)}
            aria-expanded={showHidden}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              background: "none",
              border: "none",
              cursor: "pointer",
              padding: 0,
              fontSize: 14,
              fontWeight: 600,
              color: "var(--muted)",
            }}
          >
            <span style={{ transition: "transform 0.15s", transform: showHidden ? "rotate(90deg)" : "none" }}>▸</span>
            Hidden ({hidden.length})
          </button>
          {showHidden && (
            <div style={{ marginTop: 10 }}>
              <div style={{ color: "var(--muted)", fontSize: 12, marginBottom: 8 }}>
                Hidden from this list only. A confirmed request here is still polled and still alerts its recipient.
              </div>
              <RequestsTable rows={hidden} busyId={busyId} action="unhide" onAction={(id) => setHidden(id, false)} />
            </div>
          )}
        </div>
      )}

      {error && <div style={{ marginTop: 12, fontSize: 13, color: "var(--danger)" }}>{error}</div>}
    </div>
  );
}

function RequestsTable({
  rows,
  busyId,
  action,
  onAction,
}: {
  rows: AdminWatchRequest[];
  busyId: string | null;
  action: "hide" | "unhide";
  onAction: (id: string) => void;
}) {
  return (
    <div style={{ ...cardStyle, padding: 0, overflow: "hidden" }}>
      <div style={{ overflowX: "auto" }}>
        <table className="data-table" style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
          <thead>
            <tr style={{ color: "var(--muted)", fontSize: 12, textAlign: "left" }}>
              <th style={th}>Contact</th>
              <th style={th}>Shipment</th>
              <th style={th}>Request</th>
              <th style={th}>Latest status</th>
              <th style={th}>Requested</th>
              <th style={th}></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const state = REQUEST_STATE[r.status] ?? { label: r.status, color: "var(--muted)" };
              return (
                <tr key={r.id}>
                  <td style={td} data-label="Contact">
                    {r.email ||
                      (r.phone ? (
                        <span title="WhatsApp">WhatsApp {formatPhoneForDisplay(r.phone)}</span>
                      ) : (
                        <span style={{ color: "var(--muted)" }}>WhatsApp · awaiting message</span>
                      ))}
                  </td>
                  <td style={td} data-label="Shipment">
                    <Link
                      href={`/track/${encodeURIComponent(r.carrier)}/${encodeURIComponent(r.tracking_number)}`}
                      style={{ fontFamily: "ui-monospace, monospace", fontWeight: 600 }}
                    >
                      {r.tracking_number}
                    </Link>
                    <div style={{ color: "var(--muted)", fontSize: 12 }}>
                      {CARRIER_LABELS[r.carrier] ?? r.carrier}
                      {r.label ? ` · ${r.label}` : ""}
                    </div>
                  </td>
                  <td style={td} data-label="Request">
                    <span style={{ color: state.color, fontWeight: 600, fontSize: 13 }}>{state.label}</span>
                  </td>
                  <td style={td} data-label="Latest status">
                    {r.last_known_status ? (
                      <span style={statusPillStyle(r.last_known_status)}>{humanStatus(r.last_known_status)}</span>
                    ) : (
                      <span style={{ color: "var(--muted)", fontSize: 12 }}>
                        {r.last_polled_at ? "No scan yet" : "Not polled yet"}
                      </span>
                    )}
                  </td>
                  <td style={{ ...td, color: "var(--muted)", fontSize: 12 }} data-label="Requested">
                    {new Date(r.created_at * 1000).toLocaleString()}
                  </td>
                  <td style={{ ...td, textAlign: "right", whiteSpace: "nowrap" }}>
                    <button
                      type="button"
                      onClick={() => onAction(r.id)}
                      disabled={busyId === r.id}
                      title={action === "hide" ? "Move to the Hidden list (does not cancel the watch)" : "Move back to the main list"}
                      style={{ ...buttonGhostStyle, padding: "6px 10px", fontSize: 12 }}
                    >
                      {action === "hide" ? "Hide" : "Unhide"}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
