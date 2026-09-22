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

  const awaiting = requests.filter((r) => r.status === "pending").length;

  return (
    <div style={{ marginTop: 32 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "0 0 12px", flexWrap: "wrap" }}>
        <h2 style={{ fontSize: 16, fontWeight: 600, margin: 0 }}>
          Guest watch requests ({requests.length})
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
      ) : (
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
                </tr>
              </thead>
              <tbody>
                {requests.map((r) => {
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
                          <span style={statusPillStyle(r.last_known_status)}>
                            {humanStatus(r.last_known_status)}
                          </span>
                        ) : (
                          <span style={{ color: "var(--muted)", fontSize: 12 }}>
                            {r.last_polled_at ? "No scan yet" : "Not polled yet"}
                          </span>
                        )}
                      </td>
                      <td style={{ ...td, color: "var(--muted)", fontSize: 12 }} data-label="Requested">
                        {new Date(r.created_at * 1000).toLocaleString()}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
      {error && <div style={{ marginTop: 12, fontSize: 13, color: "var(--danger)" }}>{error}</div>}
    </div>
  );
}
