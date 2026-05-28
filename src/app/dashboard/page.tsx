import { redirect } from "next/navigation";
import { getEnv } from "@/lib/env";
import { readSessionFromCookies } from "@/lib/auth";
import { getUserById, listWatchesByUser, listAllUsersForAdmin, type WatchRow } from "@/lib/db";
import { DashboardClient } from "./client";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const env = getEnv();
  if (!env.DB || !env.TOKEN_SECRET) {
    return <main style={{ padding: 48 }}>Server not configured.</main>;
  }

  const sess = await readSessionFromCookies(env.TOKEN_SECRET);
  if (!sess) redirect("/login");

  const user = await getUserById(env.DB, sess.userId);
  if (!user) redirect("/login");

  const watches = await listWatchesByUser(env.DB, sess.userId);
  const isAdmin = user.is_admin === 1;
  const adminUsers = isAdmin ? await listAllUsersForAdmin(env.DB) : null;

  return (
    <DashboardClient
      email={user.email}
      resendKeyConfigured={!!user.resend_api_key}
      initialWatches={watches.map(serializeWatch)}
      isAdmin={isAdmin}
      adminUsers={adminUsers}
    />
  );
}

function serializeWatch(w: WatchRow) {
  return {
    id: w.id,
    email: w.email,
    carrier: w.carrier,
    trackingNumber: w.tracking_number,
    label: w.label,
    status: w.status,
    lastKnownStatus: w.last_known_status,
    lastPolledAt: w.last_polled_at,
    createdAt: w.created_at,
  };
}
