import type { MetadataRoute } from "next";

const SITE_URL = "https://shiptrack.aswincloud.com";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        // Keep auth and per-user pages out of the index. Also block the API,
        // which Cloudflare logs already cover and which has no SEO value.
        disallow: ["/api/", "/dashboard", "/verify", "/reset", "/forgot"],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
