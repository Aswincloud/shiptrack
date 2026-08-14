import { redirect } from "next/navigation";
import { getEnv } from "@/lib/env";
import { readSessionFromCookies } from "@/lib/auth";
import { getUserById } from "@/lib/db";
import { hasRealPassword } from "@aswincloud/auth/d1";
import { SettingsClient } from "./client";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const env = getEnv();
  if (!env.DB || !env.TOKEN_SECRET) {
    return <main style={{ padding: 48 }}>Server not configured.</main>;
  }
  const sess = await readSessionFromCookies(env.TOKEN_SECRET);
  if (!sess) redirect("/login");

  const user = await getUserById(env.DB, sess.userId);
  if (!user) redirect("/login");

  return (
    <SettingsClient
      email={user.email}
      name={user.name}
      isAdmin={user.is_admin === 1}
      hasPassword={hasRealPassword(user)}
      createdAt={user.created_at}
    />
  );
}
