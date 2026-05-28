"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { inputStyle, buttonStyle, buttonGhostStyle, cardStyle } from "../styles";

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
  resendKeyConfigured: initialResendKey,
  initialWatches,
  isAdmin,
  adminUsers,
}: {
  email: string;
  resendKeyConfigured: boolean;
  initialWatches: ClientWatch[];
  isAdmin: boolean;
  adminUsers: AdminUser[] | null;
}) {
  const router = useRouter();
  const [watches, setWatches] = useState<ClientWatch[]>(initialWatches);
  const [keyConfigured, setKeyConfigured] = useState(initialResendKey);
  const [editingId, setEditingId] = useState<string | null>(null);

  async function cancelWatch(id: string) {
    if (!confirm("Stop alerts for this shipment?")) return;
    const res = await fetch(`/api/watches/${encodeURIComponent(id)}`, { method: "DELETE" });
    if (res.ok) {
      setWatches((ws) => ws.map((w) => (w.id === id ? { ...w, status: "cancelled" } : w)));
    }
  }

  return (
    <main style={{ maxWidth: 880, margin: "0 auto", padding: "48px 20px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 700, margin: 0 }}>Dashboard</h1>
          <p style={{ color: "var(--muted)", margin: "4px 0 0" }}>{email}</p>
        </div>
        <a href="/" style={{ color: "var(--accent)", fontSize: 14 }}>+ Track a shipment</a>
      </div>

      {watches.length === 0 ? (
        <div style={{ ...cardStyle, textAlign: "center", color: "var(--muted)" }}>
          <p style={{ margin: 0 }}>No watches yet.</p>
          <p style={{ marginTop: 8, fontSize: 14 }}>
            <a href="/">Track a shipment</a> and click &ldquo;Notify me on changes&rdquo; to add one.
          </p>
        </div>
      ) : (
        <div style={{ ...cardStyle, padding: 0, overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
            <thead>
              <tr style={{ background: "var(--card)", color: "var(--muted)", fontSize: 12, textAlign: "left" }}>
                <th style={th}>Tracking</th>
                <th style={th}>Label</th>
                <th style={th}>Notify email</th>
                <th style={th}>Status</th>
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
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      <ResendKeySection initial={keyConfigured} onChange={setKeyConfigured} />

      {isAdmin && adminUsers && <AdminSection initialUsers={adminUsers} currentUserId={undefined} />}

      <div style={{ marginTop: 32, color: "var(--muted)", fontSize: 13 }}>
        <button
          type="button"
          style={{ ...buttonGhostStyle, padding: "6px 12px", fontSize: 13 }}
          onClick={async () => {
            await fetch("/api/auth/logout", { method: "POST" });
            router.push("/");
          }}
        >
          Sign out
        </button>
      </div>
    </main>
  );
}

function WatchRow({
  watch: w,
  editing,
  onEdit,
  onSave,
  onCancel,
  onCloseEdit,
}: {
  watch: ClientWatch;
  editing: boolean;
  onEdit: () => void;
  onSave: (patch: Partial<ClientWatch>) => void;
  onCancel: () => void;
  onCloseEdit: () => void;
}) {
  const [label, setLabel] = useState(w.label ?? "");
  const [email, setEmail] = useState(w.email);
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    const body: Record<string, unknown> = {};
    if (label !== (w.label ?? "")) body.label = label || null;
    if (email !== w.email) body.email = email;
    const res = await fetch(`/api/watches/${encodeURIComponent(w.id)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    setSaving(false);
    if (res.ok) onSave({ label: label || null, email });
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
        <td style={td}>
          <input value={label} onChange={(e) => setLabel(e.target.value)} style={{ ...inputStyle, padding: "6px 8px", fontSize: 13 }} />
        </td>
        <td style={td}>
          <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" style={{ ...inputStyle, padding: "6px 8px", fontSize: 13 }} />
        </td>
        <td style={td} colSpan={2}>
          <em style={{ color: "var(--muted)", fontSize: 12 }}>Editing…</em>
        </td>
        <td style={{ ...td, textAlign: "right", whiteSpace: "nowrap" }}>
          <button type="button" onClick={save} disabled={saving} style={{ ...buttonStyle, padding: "6px 12px", fontSize: 13, marginRight: 4 }}>
            {saving ? "…" : "Save"}
          </button>
          <button type="button" onClick={onCloseEdit} style={{ ...buttonGhostStyle, padding: "6px 12px", fontSize: 13 }}>Cancel</button>
        </td>
      </tr>
    );
  }

  return (
    <tr style={trStyle}>
      <td style={td}>
        <code style={{ fontSize: 13 }}>{w.trackingNumber}</code>
        <div style={{ color: "var(--muted)", fontSize: 12 }}>{w.carrier}</div>
      </td>
      <td style={td}>{w.label ?? <span style={{ color: "var(--muted)" }}>—</span>}</td>
      <td style={td}><span style={{ color: "var(--muted)" }}>{w.email}</span></td>
      <td style={td}>{statusText}</td>
      <td style={{ ...td, color: "var(--muted)", fontSize: 12 }}>{polled}</td>
      <td style={{ ...td, textAlign: "right", whiteSpace: "nowrap" }}>
        {w.status !== "cancelled" && (
          <>
            <button type="button" onClick={onEdit} style={{ ...buttonGhostStyle, padding: "6px 12px", fontSize: 13, marginRight: 4 }}>Edit</button>
            <button type="button" onClick={onCancel} style={{ ...buttonGhostStyle, padding: "6px 12px", fontSize: 13, color: "#ff9b9b", borderColor: "#5a2a2a" }}>Cancel</button>
          </>
        )}
      </td>
    </tr>
  );
}

function ResendKeySection({ initial, onChange }: { initial: boolean; onChange: (v: boolean) => void }) {
  const [key, setKey] = useState("");
  const [saving, setSaving] = useState(false);
  const [info, setInfo] = useState<string | null>(null);

  async function save() {
    if (!key.trim()) return;
    setSaving(true);
    const res = await fetch("/api/user/resend-key", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: key.trim() }),
    });
    setSaving(false);
    if (res.ok) {
      onChange(true);
      setKey("");
      setInfo("Saved.");
    } else {
      setInfo("Save failed.");
    }
  }

  async function clear() {
    setSaving(true);
    const res = await fetch("/api/user/resend-key", { method: "DELETE" });
    setSaving(false);
    if (res.ok) {
      onChange(false);
      setInfo("Cleared.");
    }
  }

  return (
    <div style={{ ...cardStyle, marginTop: 24 }}>
      <div style={{ fontWeight: 600, marginBottom: 4 }}>Resend API key (optional)</div>
      <div style={{ color: "var(--muted)", fontSize: 13, marginBottom: 12 }}>
        Set your own Resend key to send alerts from your domain. Leave blank to use the shared system key.
        {" "}Status: {initial ? <span style={{ color: "#7cd992" }}>configured ✓</span> : "not set"}
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <input
          type="password"
          value={key}
          onChange={(e) => setKey(e.target.value)}
          placeholder="re_..."
          style={{ ...inputStyle, flex: 1, minWidth: 240 }}
        />
        <button type="button" onClick={save} disabled={saving || !key.trim()} style={buttonStyle}>Save</button>
        {initial && (
          <button type="button" onClick={clear} disabled={saving} style={buttonGhostStyle}>Clear</button>
        )}
      </div>
      {info && <div style={{ marginTop: 12, fontSize: 13, color: "var(--muted)" }}>{info}</div>}
    </div>
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
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
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
                  <td style={td}>
                    {u.email_verified === 1 ? (
                      <span style={{ color: "#7cd992" }}>✓</span>
                    ) : (
                      <span style={{ color: "var(--muted)" }}>—</span>
                    )}
                  </td>
                  <td style={td}>{u.watch_count}</td>
                  <td style={{ ...td, color: "var(--muted)", fontSize: 12 }}>
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
                      style={{ ...buttonGhostStyle, padding: "6px 10px", fontSize: 12, color: "#ff9b9b", borderColor: "#5a2a2a" }}
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
      {info && <div style={{ marginTop: 12, fontSize: 13, color: "#7cd992" }}>{info}</div>}
      {error && <div style={{ marginTop: 12, fontSize: 13, color: "#ff9b9b" }}>{error}</div>}
    </div>
  );
}

const th: React.CSSProperties = {
  padding: "12px 14px",
  borderBottom: "1px solid var(--border)",
  fontWeight: 500,
};
const td: React.CSSProperties = {
  padding: "12px 14px",
  borderBottom: "1px solid var(--border)",
};
const trStyle: React.CSSProperties = {};
