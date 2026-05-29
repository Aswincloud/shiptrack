import type { Metadata } from "next";
import Link from "next/link";
import Script from "next/script";
import { Inter } from "next/font/google";
import { getEnvAsync } from "@/lib/env";
import { readSessionFromCookies } from "@/lib/auth";
import "./globals.css";

const CHATWOOT_BASE_URL = "https://support.aswincloud.com";
const CHATWOOT_WEBSITE_TOKEN = "A2f18JGY7uLahTifqxi74Ncd";

export const dynamic = "force-dynamic";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const SITE_URL = "https://shiptrack.aswincloud.com";
const SITE_NAME = "ShipTrack";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "ShipTrack — Free Blue Dart tracking with email alerts",
    template: "%s · ShipTrack",
  },
  description:
    "Track Blue Dart shipments for free. Paste an AWB / waybill number to see live status and scan history, or sign up to get instant email alerts when your courier moves. Open source, no ads, no signup required to track.",
  keywords: [
    "Blue Dart tracking",
    "Bluedart tracking",
    "Blue Dart waybill",
    "AWB tracking India",
    "courier tracking India",
    "shipment tracking",
    "Blue Dart courier status",
    "track parcel India",
    "free Bluedart tracker",
    "Blue Dart email alerts",
    "open source courier tracker",
    "ShipTrack",
  ],
  applicationName: SITE_NAME,
  authors: [{ name: "Aswin", url: "https://github.com/Aswincloud" }],
  creator: "Aswin",
  publisher: "Aswin",
  category: "Logistics",
  alternates: {
    canonical: "/",
  },
  openGraph: {
    type: "website",
    url: SITE_URL,
    siteName: SITE_NAME,
    title: "ShipTrack — Free Blue Dart tracking with email alerts",
    description:
      "Track Blue Dart shipments for free. Live status, full scan history, optional email alerts. Open source.",
    locale: "en_IN",
    images: [
      {
        url: "/apple-icon.svg",
        width: 180,
        height: 180,
        alt: "ShipTrack",
      },
    ],
  },
  twitter: {
    card: "summary",
    title: "ShipTrack — Free Blue Dart tracking with email alerts",
    description:
      "Track Blue Dart shipments for free. Live status, full scan history, optional email alerts.",
    images: ["/apple-icon.svg"],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-snippet": -1,
      "max-image-preview": "large",
      "max-video-preview": -1,
    },
  },
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const env = await getEnvAsync();
  const signedIn = env?.DB && env?.TOKEN_SECRET
    ? !!(await readSessionFromCookies(env.TOKEN_SECRET))
    : false;

  return (
    <html lang="en" className={inter.variable}>
      <body>
        <nav
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            padding: "16px 24px",
            borderBottom: "1px solid var(--border)",
            background: "rgba(255, 255, 255, 0.7)",
            backdropFilter: "blur(12px)",
            WebkitBackdropFilter: "blur(12px)",
            position: "sticky",
            top: 0,
            zIndex: 10,
            fontSize: 14,
          }}
        >
          <Link
            href="/"
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              fontWeight: 700,
              fontSize: 16,
              color: "var(--fg)",
              textDecoration: "none",
              letterSpacing: "-0.02em",
            }}
          >
            <span
              aria-hidden
              style={{
                width: 28,
                height: 28,
                borderRadius: 8,
                background: "var(--accent-gradient)",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                color: "#fff",
                fontSize: 14,
                fontWeight: 700,
                boxShadow: "var(--shadow-md)",
              }}
            >
              S
            </span>
            ShipTrack
          </Link>
          <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
            {signedIn ? (
              <>
                <Link
                  href="/dashboard"
                  style={{
                    padding: "8px 14px",
                    borderRadius: 8,
                    color: "var(--fg-soft)",
                    textDecoration: "none",
                    fontWeight: 500,
                    transition: "background 0.15s",
                  }}
                >
                  Dashboard
                </Link>
                <form action="/api/auth/logout" method="POST" style={{ display: "inline" }}>
                  <button
                    type="submit"
                    style={{
                      background: "transparent",
                      border: "none",
                      color: "var(--muted)",
                      cursor: "pointer",
                      font: "inherit",
                      fontWeight: 500,
                      padding: "8px 14px",
                      borderRadius: 8,
                    }}
                  >
                    Sign out
                  </button>
                </form>
              </>
            ) : (
              <>
                <Link
                  href="/login"
                  style={{
                    padding: "8px 14px",
                    borderRadius: 8,
                    color: "var(--fg-soft)",
                    textDecoration: "none",
                    fontWeight: 500,
                  }}
                >
                  Sign in
                </Link>
                <Link
                  href="/signup"
                  style={{
                    padding: "8px 14px",
                    borderRadius: 8,
                    background: "var(--accent-gradient)",
                    color: "#fff",
                    textDecoration: "none",
                    fontWeight: 500,
                    boxShadow: "var(--shadow-md)",
                  }}
                >
                  Sign up
                </Link>
              </>
            )}
          </div>
        </nav>
        {children}

        <Script id="chatwoot-settings" strategy="afterInteractive">
          {`window.chatwootSettings = { position: "right", type: "standard", launcherTitle: "Chat with us" };`}
        </Script>
        <Script
          id="chatwoot-sdk"
          strategy="afterInteractive"
          src={`${CHATWOOT_BASE_URL}/packs/js/sdk.js`}
        />
        <Script id="chatwoot-init" strategy="afterInteractive">
          {`
            (function init() {
              if (!window.chatwootSDK) { setTimeout(init, 100); return; }
              window.chatwootSDK.run({ websiteToken: "${CHATWOOT_WEBSITE_TOKEN}", baseUrl: "${CHATWOOT_BASE_URL}" });
            })();
          `}
        </Script>
      </body>
    </html>
  );
}
