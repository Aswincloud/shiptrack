import { NextRequest } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { confirmWatch, getWatch } from "@/lib/db";
import { verifyToken } from "@/lib/tokens";

export const dynamic = "force-dynamic";

function page(title: string, body: string, status = 200): Response {
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>${title}</title>
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <style>body{font-family:system-ui;background:#0b0d10;color:#e6e8eb;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0}
    .card{background:#11141a;border:1px solid #1f242b;border-radius:12px;padding:32px;max-width:480px;text-align:center}
    h1{margin:0 0 12px;font-size:22px}a{color:#4f9eff}</style></head>
    <body><div class="card"><h1>${title}</h1>${body}</div></body></html>`;
  return new Response(html, { status, headers: { "content-type": "text/html; charset=utf-8" } });
}

export async function GET(req: NextRequest) {
  const token = new URL(req.url).searchParams.get("token");
  if (!token) return page("Invalid link", "<p>Missing token.</p>", 400);

  const { env } = getCloudflareContext();
  const e = env as unknown as {
    DB: import("@cloudflare/workers-types").D1Database;
    TOKEN_SECRET: string;
  };
  if (!e.DB || !e.TOKEN_SECRET) return page("Not configured", "<p>Server not configured.</p>", 503);

  const watchId = await verifyToken(e.TOKEN_SECRET, token, "confirm");
  if (!watchId) return page("Invalid or expired link", "<p>This link is no longer valid.</p>", 400);

  const watch = await getWatch(e.DB, watchId);
  if (!watch) return page("Not found", "<p>Watch not found.</p>", 404);

  if (watch.status === "active") {
    return page(
      "Already active",
      `<p>Alerts already enabled for <code>${escapeHtml(watch.tracking_number)}</code>.</p>
       <p><a href="/">Back to ShipTrack</a></p>`,
    );
  }

  const ok = await confirmWatch(e.DB, watchId);
  if (!ok) return page("Could not confirm", "<p>This watch could not be activated.</p>", 400);

  return page(
    "Alerts enabled",
    `<p>You'll get an email when the status of <code>${escapeHtml(watch.tracking_number)}</code> changes.</p>
     <p><a href="/">Back to ShipTrack</a></p>`,
  );
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
