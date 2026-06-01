import { redirect } from "next/navigation";
import { getEnv } from "@/lib/env";
import { readSessionFromCookies } from "@/lib/auth";
import { getUserById, getPendingEmailChangeRequestForUser } from "@/lib/db";
import { SettingsClient } from "./client";

export const dynamic = "force-dynamic";

const OAUTH_ONLY_HASH = "pbkdf2$100000$oauth_only$oauth_only";

export default async function SettingsPage() {
  const env = getEnv();
  if (!env.DB || !env.TOKEN_SECRET) {
    return <main style={{ padding: 48 }}>Server not configured.</main>;
  }
  const sess = await readSessionFromCookies(env.TOKEN_SECRET);
  if (!sess) redirect("/login");

  const user = await getUserById(env.DB, sess.userId);
  if (!user) redirect("/login");

  const pendingEmailChange = await getPendingEmailChangeRequestForUser(env.DB, user.id);

  return (
    <SettingsClient
      email={user.email}
      name={user.name}
      isAdmin={user.is_admin === 1}
      hasPassword={user.password_hash !== OAUTH_ONLY_HASH}
      createdAt={user.created_at}
      initialPendingEmailChange={
        pendingEmailChange
          ? {
              id: pendingEmailChange.id,
              requestedEmail: pendingEmailChange.requested_email,
              createdAt: pendingEmailChange.created_at,
            }
          : null
      }
    />
  );
}
