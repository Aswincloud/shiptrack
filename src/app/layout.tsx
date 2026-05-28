import type { Metadata } from "next";
import Link from "next/link";
import { getEnv } from "@/lib/env";
import { readSessionFromCookies } from "@/lib/auth";
import "./globals.css";

export const metadata: Metadata = {
  title: "ShipTrack — Open shipment tracking",
  description: "Free, open-source shipment tracking for Indian and international couriers.",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const env = getEnv();
  const signedIn = env?.DB && env?.TOKEN_SECRET
    ? !!(await readSessionFromCookies(env.TOKEN_SECRET))
    : false;

  return (
    <html lang="en">
      <body>
        <nav
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            padding: "12px 20px",
            borderBottom: "1px solid var(--border)",
            fontSize: 14,
          }}
        >
          <Link href="/" style={{ fontWeight: 600, color: "var(--fg)", textDecoration: "none" }}>
            ShipTrack
          </Link>
          <div style={{ display: "flex", gap: 16 }}>
            {signedIn ? (
              <>
                <Link href="/dashboard">Dashboard</Link>
                <form action="/api/auth/logout" method="POST" style={{ display: "inline" }}>
                  <button
                    type="submit"
                    style={{
                      background: "transparent",
                      border: "none",
                      color: "var(--accent)",
                      cursor: "pointer",
                      font: "inherit",
                      padding: 0,
                    }}
                  >
                    Sign out
                  </button>
                </form>
              </>
            ) : (
              <>
                <Link href="/login">Sign in</Link>
                <Link href="/signup">Sign up</Link>
              </>
            )}
          </div>
        </nav>
        {children}
      </body>
    </html>
  );
}
