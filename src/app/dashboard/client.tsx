"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import type { TrackingResult } from "@/carriers/types";
import { inputStyle, buttonStyle, buttonGhostStyle, cardStyle, statusPillStyle, intervalLabel } from "../styles";
import { IntervalPicker } from "../components/IntervalPicker";
import { Timeline } from "../components/Timeline";

interface ClientWatch {
  id: string;
  email: string;
  carrier: string;
  trackingNumber: string;
  label: string | null;
  status: string;
  lastKnownStatus: string | null;
  lastPolledAt: number | null;
  createdAt: number;
  pollIntervalSeconds: number;
}

interface AdminUser {
  id: string;
  email: string;
  email_verified: number;
  is_admin: number;
  created_at: number;
  watch_count: number;
}

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
        <a
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
          + Track a shipment
        </a>
      </header>

      <section style={{ marginBottom: 32 }}>
        <h2 style={sectionTitle}>
          Your watches <span style={countBadge}>{watches.length}</span>
        </h2>
        {watches.length === 0 ? (
          <div style={{ ...cardStyle, textAlign: "center", padding: "48px 24px" }}>
            <div style={{ fontSize: 28, marginBottom: 8 }}>📦</div>
            <div style={{ fontWeight: 600, marginBottom: 4 }}>No watches yet</div>
            <div style={{ color: "var(--muted)", fontSize: 14 }}>
              <a href="/">Track a shipment</a> and click &ldquo;Notify me on changes&rdquo; to add one.
            </div>
          </div>
        ) : (
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
        )}
      </section>

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
    </main>
  );
}

// Fetches the carrier's live scan history on open and shows it in a modal.
// Reuses the public /api/track endpoint so it reflects the *full* trace, not
// just the change-events we stored since the watch was created.
function HistoryModal({ watch, onClose }: { watch: ClientWatch; onClose: () => void }) {
  const [result, setResult] = useState<TrackingResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setResult(null);
    fetch(`/api/track/${encodeURIComponent(watch.carrier)}/${encodeURIComponent(watch.trackingNumber)}`)
      .then(async (res) => {
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(
            body.error === "not_found"
              ? "No tracking info found for this shipment."
              : body.message || body.error || "Couldn't load tracking.",
          );
        }
        return res.json();
      })
      .then((r: TrackingResult) => {
        if (!cancelled) setResult(r);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "Couldn't load tracking.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [watch.carrier, watch.trackingNumber]);

  // Close on Escape.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(15,23,42,0.45)",
        backdropFilter: "blur(2px)",
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "center",
        padding: "24px 16px",
        overflowY: "auto",
        zIndex: 50,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ ...cardStyle, maxWidth: 520, width: "100%", marginTop: 40, padding: 0, overflow: "hidden" }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, padding: "20px 24px", borderBottom: "1px solid var(--border)" }}>
          <div>
            <div style={{ fontWeight: 600, fontSize: 15 }}>
              <code>{watch.trackingNumber}</code>
            </div>
            <div style={{ color: "var(--muted)", fontSize: 12, marginTop: 2, textTransform: "capitalize" }}>
              {watch.carrier}
              {result && (
                <span style={{ ...statusPillStyle(result.status), marginLeft: 8, textTransform: "none" }}>
                  {result.status.replace(/_/g, " ")}
                </span>
              )}
            </div>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" style={{ ...buttonGhostStyle, padding: "4px 10px", fontSize: 18, lineHeight: 1 }}>×</button>
        </div>

        <div style={{ padding: "12px 24px 20px", maxHeight: "60vh", overflowY: "auto" }}>
          {loading && <div style={{ color: "var(--muted)", fontSize: 14, padding: "12px 0" }}>Loading tracking history…</div>}
          {error && <div style={{ color: "var(--danger)", fontSize: 14, padding: "12px 0" }}>{error}</div>}
          {result && !loading && <Timeline events={result.events} />}
        </div>
      </div>
    </div>
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
  const [interval, setInterval] = useState<number>(w.pollIntervalSeconds);
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    const body: Record<string, unknown> = {};
    if (label !== (w.label ?? "")) body.label = label || null;
    if (email !== w.email) body.email = email;
    if (interval !== w.pollIntervalSeconds) body.pollIntervalSeconds = interval;
    const res = await fetch(`/api/watches/${encodeURIComponent(w.id)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    setSaving(false);
    if (res.ok) onSave({ label: label || null, email, pollIntervalSeconds: interval });
  }

  const statusText = w.status === "cancelled" ? "cancelled" : (w.lastKnownStatus ?? w.status).replace(/_/g, " ");
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
          <IntervalPicker value={interval} onChange={setInterval} style={{ width: "100%" }} />
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
      </td>
      <td style={{ ...td, color: "var(--muted)", fontSize: 12 }} data-label="Interval">
        {intervalLabel(w.pollIntervalSeconds)}
      </td>
      <td style={{ ...td, color: "var(--muted)", fontSize: 12 }} data-label="Last poll">{polled}</td>
      <td style={{ ...td, textAlign: "right", whiteSpace: "nowrap" }}>
        <button type="button" onClick={onView} style={{ ...buttonGhostStyle, padding: "7px 14px", fontSize: 13, marginRight: 4 }}>View</button>
        {w.status !== "cancelled" && (
          <>
            <button type="button" onClick={onEdit} style={{ ...buttonGhostStyle, padding: "7px 14px", fontSize: 13, marginRight: 4 }}>Edit</button>
            <button type="button" onClick={onCancel} style={{ ...buttonGhostStyle, padding: "7px 14px", fontSize: 13, color: "var(--danger)", borderColor: "var(--danger-border)", background: "var(--danger-bg)" }}>Cancel</button>
          </>
        )}
      </td>
    </tr>
  );
}

function AdminSection({
  initialUsers,
  currentUserId: _currentUserId,
}: {
  initialUsers: AdminUser[];
  currentUserId: string | undefined;
}) {
  const [users, setUsers] = useState<AdminUser[]>(initialUsers);
  const [actingId, setActingId] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    const res = await fetch("/api/admin/users");
    if (res.ok) {
      const body = await res.json();
      setUsers(body.users);
    }
  }

  async function deleteUser(u: AdminUser) {
    if (!confirm(`Delete account ${u.email}? This cancels all their watches and emails them a notice.`)) return;
    setError(null);
    setInfo(null);
    setActingId(u.id);
    const res = await fetch(`/api/admin/users/${encodeURIComponent(u.id)}`, { method: "DELETE" });
    setActingId(null);
    if (res.ok) {
      setInfo(`Deleted ${u.email}. Notice sent.`);
      setUsers((us) => us.filter((x) => x.id !== u.id));
    } else {
      const body = await res.json().catch(() => ({}));
      const msg =
        body.error === "cannot_delete_self"
          ? "You can't delete your own admin account."
          : body.error === "last_admin"
            ? "Can't delete the last admin — promote another user first."
            : "Delete failed.";
      setError(msg);
    }
  }

  async function forceReset(u: AdminUser) {
    if (!confirm(`Send a password reset link to ${u.email}?`)) return;
    setError(null);
    setInfo(null);
    setActingId(u.id);
    const res = await fetch(`/api/admin/users/${encodeURIComponent(u.id)}/force-reset`, { method: "POST" });
    setActingId(null);
    if (res.ok) setInfo(`Reset link sent to ${u.email}.`);
    else setError(`Couldn't send reset link to ${u.email}.`);
  }

  async function editEmail(u: AdminUser) {
    const next = window.prompt(`New email for ${u.email}:`, u.email);
    if (!next || next === u.email) return;
    setError(null);
    setInfo(null);
    setActingId(u.id);
    const res = await fetch(`/api/admin/users/${encodeURIComponent(u.id)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: next }),
    });
    setActingId(null);
    if (res.ok) {
      setInfo(`Email updated to ${next}.`);
      await refresh();
    } else {
      const body = await res.json().catch(() => ({}));
      setError(body.error === "email_in_use" ? "That email is already used by another account." : "Update failed.");
    }
  }

  async function emailUser(u: AdminUser) {
    const subject = window.prompt(`Subject for email to ${u.email}:`);
    if (!subject) return;
    const message = window.prompt(`Message body:`);
    if (!message) return;
    setError(null);
    setInfo(null);
    setActingId(u.id);
    const res = await fetch(`/api/admin/users/${encodeURIComponent(u.id)}/email`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ subject, message }),
    });
    setActingId(null);
    if (res.ok) setInfo(`Email sent to ${u.email}.`);
    else setError(`Couldn't send email to ${u.email}.`);
  }

  return (
    <div style={{ marginTop: 32 }}>
      <h2 style={{ fontSize: 16, fontWeight: 600, margin: "0 0 12px" }}>Users ({users.length})</h2>
      <div style={{ ...cardStyle, padding: 0, overflow: "hidden" }}>
        <div style={{ overflowX: "auto" }}>
          <table className="data-table" style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
            <thead>
              <tr style={{ color: "var(--muted)", fontSize: 12, textAlign: "left" }}>
                <th style={th}>Email</th>
                <th style={th}>Verified</th>
                <th style={th}>Watches</th>
                <th style={th}>Created</th>
                <th style={th}></th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id}>
                  <td style={td}>{u.email}</td>
                  <td style={td} data-label="Verified">
                    {u.email_verified === 1 ? (
                      <span style={{ color: "var(--success)" }}>✓</span>
                    ) : (
                      <span style={{ color: "var(--muted)" }}>—</span>
                    )}
                  </td>
                  <td style={td} data-label="Watches">{u.watch_count}</td>
                  <td style={{ ...td, color: "var(--muted)", fontSize: 12 }} data-label="Created">
                    {new Date(u.created_at * 1000).toLocaleDateString()}
                  </td>
                  <td style={{ ...td, textAlign: "right", whiteSpace: "nowrap" }}>
                    <button
                      type="button"
                      onClick={() => forceReset(u)}
                      disabled={actingId === u.id}
                      style={{ ...buttonGhostStyle, padding: "6px 10px", fontSize: 12, marginRight: 4 }}
                    >
                      Reset
                    </button>
                    <button
                      type="button"
                      onClick={() => editEmail(u)}
                      disabled={actingId === u.id}
                      style={{ ...buttonGhostStyle, padding: "6px 10px", fontSize: 12, marginRight: 4 }}
                    >
                      Edit email
                    </button>
                    <button
                      type="button"
                      onClick={() => emailUser(u)}
                      disabled={actingId === u.id}
                      style={{ ...buttonGhostStyle, padding: "6px 10px", fontSize: 12, marginRight: 4 }}
                    >
                      Email
                    </button>
                    <button
                      type="button"
                      onClick={() => deleteUser(u)}
                      disabled={actingId === u.id}
                      style={{ ...buttonGhostStyle, padding: "6px 10px", fontSize: 12, color: "var(--danger)", borderColor: "var(--danger)" }}
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      {info && <div style={{ marginTop: 12, fontSize: 13, color: "var(--success)" }}>{info}</div>}
      {error && <div style={{ marginTop: 12, fontSize: 13, color: "var(--danger)" }}>{error}</div>}
    </div>
  );
}

const th: React.CSSProperties = {
  padding: "10px 16px",
  borderBottom: "1px solid var(--border)",
  fontWeight: 600,
};
const td: React.CSSProperties = {
  padding: "14px 16px",
  borderBottom: "1px solid var(--border)",
};
const trStyle: React.CSSProperties = {};
