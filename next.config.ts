import type { NextConfig } from "next";
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";

initOpenNextCloudflareForDev();

const config: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
          // Cloudflare terminates TLS; the app only ever answers over HTTPS, so
          // pin it. No `preload` — that is a one-way door best flipped by hand.
          { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
          // Deliberately narrow CSP. The UI is styled inline, embeds a JSON-LD
          // script, loads Inter via next/font and the Chatwoot widget from
          // support.aswincloud.com, so script-src/style-src/default-src would
          // need 'unsafe-inline' and buy nothing. These four directives close
          // clickjacking (superseding X-Frame-Options), <base> hijacking,
          // plugin embeds and off-origin form posts without touching any of
          // that. Every auth flow (OAuth included) navigates via 302/303, and
          // the only real <form> posts to same-origin /api/auth/logout.
          {
            key: "Content-Security-Policy",
            value: "frame-ancestors 'none'; base-uri 'self'; object-src 'none'; form-action 'self'",
          },
        ],
      },
    ];
  },
};

export default config;
