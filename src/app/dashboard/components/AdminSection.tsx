"use client";

import { useState } from "react";
import { buttonGhostStyle, cardStyle } from "../../styles";
import type { AdminUser } from "./types";
import { th, td } from "./tableStyles";

export function AdminSection({
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
                <th style={th}>Active</th>
                <th style={th}>Total</th>
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
                  <td style={td} data-label="Active">{u.watch_count}</td>
                  <td style={td} data-label="Total" title="Watches created, including delivered and cancelled">{u.watches_created}</td>
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
