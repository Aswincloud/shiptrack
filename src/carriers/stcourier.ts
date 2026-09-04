import { Carrier, CarrierError, ShipmentStatus, TrackingEvent, TrackingResult } from "./types";

// ST Courier (stcourier.com) publishes no developer API — no docs, no keys, no
// portal. Their own site tracks via a two-step CodeIgniter flow that we
// replicate here:
//
//   1. POST /track/doCheck  (form field `awb_no`)
//      -> {"code":200,"msg":"Track Shipment"}  and a `ci_session` Set-Cookie.
//      -> {"code":400,"msg":"<p>The AWB Number field must contain only
//          numbers.</p>"} for malformed input.
//      The POST only *stores* the AWB against the session; it returns no data.
//   2. GET /track/shipment  with that `ci_session` cookie
//      -> server-rendered HTML holding the summary table and scan timeline.
//
// The AWB lives in the session, not the URL, so step 2 must carry the cookie
// minted by step 1 — a bare GET returns the empty search form.
//
// Not-found is signalled only by the *absence* of the "Status of AWB No."
// heading; the page still returns HTTP 200 and the same shell. Do not key off
// the word "Invalid" — that appears in inline JS validation strings on every
// page, including successful ones.
//
// Risk: same as the Blue Dart scraper — a redesign breaks parsing. Selectors
// are deliberately loose (label text and structural position, not the
// randomised CSS class names like `D2Q59l54` that ST Courier emits).

const BASE = "https://stcourier.com";
const CHECK_URL = `${BASE}/track/doCheck`;
const RESULT_URL = `${BASE}/track/shipment`;
const UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

function mapStatus(text: string): ShipmentStatus {
  const t = text.toLowerCase();
  if (t.includes("delivered") && !t.includes("undelivered") && !t.includes("not delivered")) return "delivered";
  if (t.includes("out for delivery") || t.includes("out for del")) return "out_for_delivery";
  if (t.includes("rto") || t.includes("returned") || t.includes("return to")) return "returned";
  if (
    t.includes("undelivered") ||
    t.includes("not delivered") ||
    t.includes("refused") ||
    t.includes("damage") ||
    t.includes("hold") ||
    t.includes("address") ||
    t.includes("closed") ||
    t.includes("unable")
  ) {
    return "exception";
  }
  if (t.includes("picked") || t.includes("pickup") || t.includes("pick up") || t.includes("booked")) return "picked_up";
  if (
    t.includes("in transit") ||
    t.includes("transit") ||
    t.includes("forwarded") ||
    t.includes("processed") ||
    t.includes("received") ||
    t.includes("dispatch") ||
    t.includes("bagged") ||
    t.includes("arrived") ||
    t.includes("departed")
  ) {
    return "in_transit";
  }
  return "unknown";
}

function stripTags(s: string): string {
  return s
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}

// The summary table renders as <td>Label</td><td class="font-normal">Value</td>.
// Labels carry ST Courier's own typos and trailing spaces ("Orgin SRC",
// "Destination "), so match leniently and let the caller pass what it sees.
function fieldByLabel(html: string, label: string): string | undefined {
  const re = new RegExp(
    `<td[^>]*>\\s*${label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*</td>\\s*<td[^>]*>([\\s\\S]*?)</td>`,
    "i",
  );
  const m = html.match(re);
  if (!m) return undefined;
  const v = stripTags(m[1]);
  return v.length ? v : undefined;
}

// Split a fragment on <br> into its non-empty text lines.
function brLines(html: string): string[] {
  return html
    .split(/<br\s*\/?>/i)
    .map(stripTags)
    .filter((l) => l.length > 0);
}

// Each scan is a `tl04` block holding, in document order: a date/time cell, an
// icon cell (strips to empty), and a description cell. Within a cell, <br>
// separates "Sep 03, 2026" / "10:49 PM" and "<description>" / "<location>".
function parseScans(html: string): TrackingEvent[] {
  const blocks = html.split(/class="[^"]*\btl04\b/i).slice(1);
  const events: TrackingEvent[] = [];

  for (const block of blocks) {
    // Leaf divs only (no nested <div>), so we get the content cells directly.
    const cells = Array.from(block.matchAll(/<div[^>]*>((?:(?!<div)[\s\S])*?)<\/div>/gi))
      .map((m) => m[1])
      .filter((c) => stripTags(c).length > 0);
    if (cells.length < 2) continue;

    const when = brLines(cells[0]);
    const what = brLines(cells[1]);
    const description = what[0];
    if (!description) continue;

    events.push({
      timestamp: when.join(" ").trim(),
      status: mapStatus(description),
      location: what[1] || undefined,
      description,
    });
  }

  // ST Courier's render order isn't documented and a single-scan shipment can't
  // reveal it, so derive the order from the timestamps instead of assuming.
  // Callers require oldest-first (events[last] = latest).
  const times = events.map((e) => Date.parse(e.timestamp));
  if (times.every((t) => Number.isFinite(t))) {
    return events
      .map((e, i) => ({ e, t: times[i] }))
      .sort((a, b) => a.t - b.t)
      .map(({ e }) => e);
  }
  return events;
}

// Cloudflare Workers and Node expose getSetCookie(); fall back to the folded
// header for any runtime that doesn't.
function sessionCookie(res: Response): string | undefined {
  const raw: string[] = res.headers.getSetCookie?.() ?? [];
  const headers = raw.length ? raw : [res.headers.get("set-cookie") ?? ""];
  for (const h of headers) {
    const m = h.match(/ci_session=([^;]+)/);
    if (m) return m[1];
  }
  return undefined;
}

export const stcourier: Carrier = {
  id: "stcourier",
  name: "ST Courier",
  async track(trackingNumber: string): Promise<TrackingResult> {
    const cleaned = trackingNumber.trim();
    // Their form caps input at 11 chars and the server rejects non-digits.
    if (!/^[0-9]{6,11}$/.test(cleaned)) {
      throw new CarrierError("Invalid ST Courier AWB format.", "invalid_input", 400);
    }

    const checkRes = await fetch(CHECK_URL, {
      method: "POST",
      headers: {
        "User-Agent": UA,
        Accept: "application/json, text/javascript, */*; q=0.01",
        "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
        "X-Requested-With": "XMLHttpRequest",
        Referer: `${BASE}/`,
        Origin: BASE,
      },
      body: `awb_no=${encodeURIComponent(cleaned)}`,
      cache: "no-store",
    });

    if (checkRes.status === 429) throw new CarrierError("ST Courier rate-limited", "rate_limited", 429);
    if (!checkRes.ok) throw new CarrierError(`ST Courier upstream error (${checkRes.status})`, "upstream_error", 502);

    const check = (await checkRes.json().catch(() => null)) as { code?: number; msg?: string } | null;
    if (check?.code === 400) {
      throw new CarrierError(stripTags(check.msg ?? "") || "ST Courier rejected the AWB.", "invalid_input", 400);
    }
    if (check?.code !== 200) {
      throw new CarrierError("Unexpected ST Courier response.", "upstream_error", 502);
    }

    const session = sessionCookie(checkRes);
    if (!session) {
      throw new CarrierError("ST Courier did not issue a tracking session.", "upstream_error", 502);
    }

    const res = await fetch(RESULT_URL, {
      method: "GET",
      headers: {
        "User-Agent": UA,
        Accept: "text/html",
        Referer: `${BASE}/`,
        Cookie: `ci_session=${session}`,
      },
      cache: "no-store",
    });

    if (res.status === 429) throw new CarrierError("ST Courier rate-limited", "rate_limited", 429);
    if (!res.ok) throw new CarrierError(`ST Courier upstream error (${res.status})`, "upstream_error", 502);

    const html = await res.text();

    // Existence is signalled by the result heading, which echoes the AWB.
    const heading = html.match(/Status of AWB No\.[\s\S]{0,200}?<span[^>]*>\s*([0-9]+)/i);
    if (!heading) {
      throw new CarrierError("Tracking number not found", "not_found", 404);
    }

    const events = parseScans(html);
    const current = fieldByLabel(html, "Current Status");
    const origin = fieldByLabel(html, "Orgin SRC") ?? fieldByLabel(html, "Origin SRC");
    const destination = fieldByLabel(html, "Destination");
    const latest = events[events.length - 1];

    return {
      carrier: "stcourier",
      trackingNumber: cleaned,
      // Prefer the newest scan. ST Courier's "Current Status" summary cell lags
      // its own timeline — it still read "In Transit" while the latest scan was
      // already "Out for Delivery" — so it's only a fallback when there are no
      // scans to read.
      status: latest ? latest.status : current ? mapStatus(current) : "unknown",
      origin,
      destination,
      events,
      fetchedAt: new Date().toISOString(),
      raw: { source: "scrape", url: RESULT_URL, currentStatus: current ?? null },
    };
  },
};
