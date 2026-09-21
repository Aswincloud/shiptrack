"use client";

import { useState } from "react";
import { inputStyle, buttonStyle, buttonGhostStyle, cardStyle, statusPillStyle, intervalLabel } from "../../styles";
import { IntervalPicker } from "../../components/IntervalPicker";
import type { ClientWatch } from "./types";
import { th, td, trStyle } from "./tableStyles";

// Delivered/returned watches are auto-removed this long after completion.
const PURGE_GRACE_DAYS = 7;

// Shared table used for both the active list and the collapsed "Delivered"
// section, so the two render identically.
export function WatchTable({
  watches,
  editingId,
  setEditingId,
  setWatches,
  cancelWatch,
  setViewing,
}: {
  watches: ClientWatch[];
  editingId: string | null;
  setEditingId: (id: string | null) => void;
  setWatches: React.Dispatch<React.SetStateAction<ClientWatch[]>>;
  cancelWatch: (id: string) => void;
  setViewing: (w: ClientWatch | null) => void;
}) {
  return (
    <div style={{ ...cardStyle, padding: 0, overflow: "hidden" }}>
      <div style={{ overflowX: "auto" }}>
        <table className="data-table" style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
          <thead>
            <tr style={{ background: "var(--neutral-bg)", color: "var(--muted)", fontSize: 11, textAlign: "left", textTransform: "uppercase", letterSpacing: "0.05em" }}>
              <th style={th}>Tracking</th>
              <th style={th}>Label</th>
              <th style={th}>Notify email</th>
              <th style={th}>Status</th>
              <th style={th}>Interval</th>
              <th style={th}>Last poll</th>
              <th style={th}></th>
            </tr>
          </thead>
          <tbody>
            {watches.map((w) => (
              <WatchRow
                key={w.id}
                watch={w}
                editing={editingId === w.id}
                onEdit={() => setEditingId(w.id)}
                onSave={(patch) => {
                  setWatches((ws) => ws.map((x) => (x.id === w.id ? { ...x, ...patch } : x)));
                  setEditingId(null);
                }}
                onCancel={() => cancelWatch(w.id)}
                onCloseEdit={() => setEditingId(null)}
                onView={() => setViewing(w)}
              />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function WatchRow({
  watch: w,
  editing,
  onEdit,
  onSave,
  onCancel,
  onCloseEdit,
  onView,
}: {
  watch: ClientWatch;
  editing: boolean;
  onEdit: () => void;
  onSave: (patch: Partial<ClientWatch>) => void;
  onCancel: () => void;
  onCloseEdit: () => void;
  onView: () => void;
}) {
  const [label, setLabel] = useState(w.label ?? "");
  const [email, setEmail] = useState(w.email);
  const [intervalSeconds, setIntervalSeconds] = useState<number>(w.pollIntervalSeconds);
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    const body: Record<string, unknown> = {};
    if (label !== (w.label ?? "")) body.label = label || null;
    if (email !== w.email) body.email = email;
    if (intervalSeconds !== w.pollIntervalSeconds) body.pollIntervalSeconds = intervalSeconds;
    const res = await fetch(`/api/watches/${encodeURIComponent(w.id)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    setSaving(false);
    if (!res.ok) return;
    // Repointing the watch at someone else's address parks it until they
    // confirm — reflect that instead of leaving the row looking active.
    const body2 = (await res.json().catch(() => ({}))) as { pendingConfirmation?: boolean };
    onSave({
      label: label || null,
      email,
      pollIntervalSeconds: intervalSeconds,
      ...(body2.pendingConfirmation ? { status: "pending" } : {}),
    });
  }

  // For both 'cancelled' (user) and 'completed' (poller saw delivered/returned)
  // we want to show the *outcome* — but cancelled by the user has no useful
  // last-known status to surface, so we label it explicitly. Completed rows
  // show the real terminal carrier status (e.g. 'delivered').
  const statusText =
    w.status === "cancelled"
      ? "cancelled"
      : // Parked on a notify address that isn't the account's own: no alerts go
        // out until the recipient clicks the confirmation link.
        w.status === "pending"
        ? "awaiting confirmation"
        : w.lastKnownStatus
          ? w.lastKnownStatus.replace(/_/g, " ")
          : // Active watch with no scan yet — e.g. a pre-tracked AWB the carrier
            // hasn't ingested. Make that explicit rather than showing "active".
            "awaiting first scan";
  const polled = w.lastPolledAt ? new Date(w.lastPolledAt * 1000).toLocaleString() : "—";

  if (editing) {
    return (
      <tr style={trStyle}>
        <td style={td}>
          <code style={{ fontSize: 13 }}>{w.trackingNumber}</code>
          <div style={{ color: "var(--muted)", fontSize: 12 }}>{w.carrier}</div>
        </td>
        <td style={td} data-label="Label">
          <input value={label} onChange={(e) => setLabel(e.target.value)} style={{ ...inputStyle, padding: "6px 8px", fontSize: 13, width: "100%", minWidth: 0 }} />
        </td>
        <td style={td} data-label="Email">
          <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" style={{ ...inputStyle, padding: "6px 8px", fontSize: 13, width: "100%", minWidth: 0 }} />
        </td>
        <td style={td} data-label="Status">
          <em style={{ color: "var(--muted)", fontSize: 12 }}>Editing…</em>
        </td>
        <td style={td} data-label="Interval">
          <IntervalPicker value={intervalSeconds} onChange={setIntervalSeconds} style={{ width: "100%" }} />
        </td>
        <td style={td} data-label="Last poll">
          <span style={{ color: "var(--muted)", fontSize: 12 }}>—</span>
        </td>
        <td style={{ ...td, textAlign: "right", whiteSpace: "nowrap" }}>
          <button type="button" onClick={save} disabled={saving} style={{ ...buttonStyle, padding: "7px 14px", fontSize: 13, marginRight: 4 }}>
            {saving ? "…" : "Save"}
          </button>
          <button type="button" onClick={onCloseEdit} style={{ ...buttonGhostStyle, padding: "7px 14px", fontSize: 13 }}>Cancel</button>
        </td>
      </tr>
    );
  }

  const pillStatus =
    w.status === "cancelled" ? "cancelled" : (w.lastKnownStatus ?? w.status);
  const isFinished = w.status === "cancelled" || w.status === "completed";

  // Days left before a completed watch is auto-removed (whole days, min 0).
  const purgeDaysLeft =
    w.status === "completed" && w.completedAt != null
      ? Math.max(
          0,
          PURGE_GRACE_DAYS - Math.floor((Date.now() / 1000 - w.completedAt) / 86400),
        )
      : null;

  return (
    <tr style={trStyle}>
      <td style={td}>
        <code style={{ fontSize: 13 }}>{w.trackingNumber}</code>
        <div style={{ color: "var(--muted)", fontSize: 12, marginTop: 2, textTransform: "capitalize" }}>{w.carrier}</div>
      </td>
      <td style={td} data-label="Label">{w.label ?? <span style={{ color: "var(--muted-soft)" }}>—</span>}</td>
      <td style={td} data-label="Email"><span style={{ color: "var(--muted)" }}>{w.email}</span></td>
      <td style={td} data-label="Status">
        <span style={statusPillStyle(pillStatus)}>{statusText}</span>
        {!isFinished && w.estimatedDelivery && (
          <div style={{ color: "var(--muted)", fontSize: 11, marginTop: 3 }}>
            expected {w.estimatedDelivery}
          </div>
        )}
        {purgeDaysLeft !== null && (
          <div style={{ color: "var(--muted-soft)", fontSize: 11, marginTop: 3 }}>
            auto-removes in {purgeDaysLeft === 0 ? "<1 day" : `${purgeDaysLeft} day${purgeDaysLeft === 1 ? "" : "s"}`}
          </div>
        )}
      </td>
      <td style={{ ...td, color: "var(--muted)", fontSize: 12 }} data-label="Interval">
        {intervalLabel(w.pollIntervalSeconds)}
      </td>
      <td style={{ ...td, color: "var(--muted)", fontSize: 12 }} data-label="Last poll">{polled}</td>
      <td style={{ ...td, textAlign: "right", whiteSpace: "nowrap" }}>
        <button type="button" onClick={onView} style={{ ...buttonGhostStyle, padding: "7px 14px", fontSize: 13, marginRight: 4 }}>View</button>
        {!isFinished && (
          <>
            <button type="button" onClick={onEdit} style={{ ...buttonGhostStyle, padding: "7px 14px", fontSize: 13, marginRight: 4 }}>Edit</button>
            <button type="button" onClick={onCancel} style={{ ...buttonGhostStyle, padding: "7px 14px", fontSize: 13, color: "var(--danger)", borderColor: "var(--danger-border)", background: "var(--danger-bg)" }}>Cancel</button>
          </>
        )}
      </td>
    </tr>
  );
}
