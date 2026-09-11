import { Carrier, CarrierError, ShipmentStatus, TrackingEvent, TrackingResult } from "./types";

// The Professional Couriers (tpcindia.com) publishes no developer API. Their
// website's Track n Trace form sits behind an image captcha, and the old
// `/Tracking2014.aspx?id=` deep link now bounces to /Oops.aspx, so the site
// itself can't be scraped without an OCR step.
//
// Their mobile app, however, reads a plain-text feed that needs neither a
// captcha nor credentials:
//
//   GET https://www.tpcindia.com/TPCWebService/TrackMobDe.ashx?podno=<CONSIGNMENT>
//
// Response (text/plain, CRLF line endings, newest scan first):
//
//     Forwarding Details :
//     08/09/2026    Time : 10:48:00
//     City : Tiruvannamalai   WayNo : ITMI1505876
//     Activity : Despatched to Tiruvannamalai - MTP
//     Pieces : 1   Weight : 0.1
//
//     08/09/2026    Time : 10:29:00
//     City : Tiruvannamalai   WayNo : MMAA4277493
//     Activity : Received at Tiruvannamalai
//     Pieces : 1   Weight : 0.1
//
// An unknown, malformed or empty consignment number returns HTTP 200 with only
// the "Forwarding Details :" header, so not-found is "header but no scans".
// The consignment number is matched case-insensitively.
//
// Dates are DD/MM/YYYY in Indian local time. `WayNo` is TPC's internal
// bag/manifest reference and is dropped: the same scan is often recorded once
// against the bag and once against the consignment, producing duplicate rows
// that differ only in WayNo, so events are de-duplicated on time + activity +
// city instead.
//
// There is also `/TPCWebService/Track.ashx?client=&podno=&tpcpwd=`, gated by a
// TPC corporate login (their own error copy says to ask a branch or
// blr-it@tpcglobe.com). Its response shape is undocumented and we have no
// account to test with, so it isn't used here.
//
// The feed carries no summary status, origin, destination or ETA; status is
// derived from the newest activity text.

const FEED_URL = "https://www.tpcindia.com/TPCWebService/TrackMobDe.ashx";
const UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

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
    t.includes("unable") ||
    t.includes("missed") ||
    t.includes("unclaimed")
  ) {
    return "exception";
  }
  if (t.includes("booked") || t.includes("picked") || t.includes("pickup") || t.includes("pick up")) return "picked_up";
  if (
    t.includes("despatch") ||
    t.includes("dispatch") ||
    t.includes("received") ||
    t.includes("transit") ||
    t.includes("forward") ||
    t.includes("arrived") ||
    t.includes("departed") ||
    t.includes("bagged") ||
    t.includes("connected")
  ) {
    return "in_transit";
  }
  return "unknown";
}

interface ParsedScan {
  event: TrackingEvent;
  time: number; // epoch ms, NaN when the date line was unreadable
}

// Convert "08/09/2026" + "10:48:00" into a display string ("08 Sep 2026 10:48:00")
// and an epoch for ordering. DD/MM/YYYY is ambiguous to Date.parse, so build it
// by hand rather than passing the raw string through.
function parseWhen(date: string, time: string | undefined): { display: string; epoch: number } {
  const m = date.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return { display: [date, time].filter(Boolean).join(" "), epoch: NaN };
  const day = Number(m[1]);
  const month = Number(m[2]);
  const year = Number(m[3]);
  const [hh = 0, mm = 0, ss = 0] = (time ?? "").split(":").map((n) => Number(n));
  const epoch = Date.UTC(year, month - 1, day, hh, mm, ss) - 5.5 * 60 * 60 * 1000; // IST
  const display = `${String(day).padStart(2, "0")} ${MONTHS[month - 1] ?? m[2]} ${year}${time ? ` ${time}` : ""}`;
  return { display, epoch };
}

function parseFeed(text: string): TrackingEvent[] {
  // Blocks are separated by a blank line; the first block is the header.
  const blocks = text
    .replace(/\r\n/g, "\n")
    .split(/\n\s*\n/)
    .map((b) => b.trim())
    .filter((b) => b.length > 0 && !/^Forwarding Details\s*:?\s*$/i.test(b));

  const scans: ParsedScan[] = [];
  for (const block of blocks) {
    const flat = block.replace(/\s+/g, " ");
    const date = flat.match(/\b(\d{1,2}\/\d{1,2}\/\d{4})\b/)?.[1];
    const time = flat.match(/\bTime\s*:\s*(\d{1,2}:\d{2}(?::\d{2})?)/i)?.[1];
    const city = flat.match(/\bCity\s*:\s*(.*?)\s*(?:\bWayNo\s*:|\bActivity\s*:|$)/i)?.[1]?.trim();
    const activity = flat.match(/\bActivity\s*:\s*(.*?)\s*(?:\bPieces\s*:|\bWeight\s*:|$)/i)?.[1]?.trim();
    if (!activity) continue;

    const when = date ? parseWhen(date, time) : { display: "", epoch: NaN };
    scans.push({
      time: when.epoch,
      event: {
        timestamp: when.display,
        status: mapStatus(activity),
        location: city || undefined,
        description: activity,
      },
    });
  }

  // Drop rows that are the same scan recorded against a different WayNo.
  const seen = new Set<string>();
  const unique = scans.filter(({ event }) => {
    const key = `${event.timestamp}|${event.description}|${event.location ?? ""}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  // Feed is newest-first; callers require oldest-first (events[last] = latest).
  // Reverse, then stable-sort by time so any out-of-order rows land correctly
  // while undated rows keep their position.
  unique.reverse();
  if (unique.every((s) => Number.isFinite(s.time))) {
    unique.sort((a, b) => a.time - b.time);
  }
  return unique.map((s) => s.event);
}

export const tpc: Carrier = {
  id: "tpc",
  name: "The Professional Couriers",
  async track(trackingNumber: string): Promise<TrackingResult> {
    // Consignment numbers are a 2-5 letter branch prefix plus digits, e.g.
    // PON8334106 (the WayNo bag references in the feed do *not* resolve). Keep
    // the check loose — TPC treats anything unknown as "no scans" anyway.
    const cleaned = trackingNumber.trim().toUpperCase();
    if (!/^[A-Z0-9]{6,20}$/.test(cleaned)) {
      throw new CarrierError("Invalid Professional Couriers consignment number format.", "invalid_input", 400);
    }

    const url = `${FEED_URL}?podno=${encodeURIComponent(cleaned)}`;
    const res = await fetch(url, {
      method: "GET",
      headers: { "User-Agent": UA, Accept: "text/plain, */*" },
      cache: "no-store",
    });

    if (res.status === 429) throw new CarrierError("Professional Couriers rate-limited", "rate_limited", 429);
    if (!res.ok) {
      throw new CarrierError(`Professional Couriers upstream error (${res.status})`, "upstream_error", 502);
    }

    const text = await res.text();
    // Anything other than the feed (an HTML error page, the /Oops.aspx redirect
    // body, a changed endpoint) lacks the header entirely.
    if (!/Forwarding Details/i.test(text)) {
      throw new CarrierError("Unexpected Professional Couriers response.", "upstream_error", 502);
    }

    const events = parseFeed(text);
    if (events.length === 0) {
      throw new CarrierError("Tracking number not found", "not_found", 404);
    }
    const latest = events[events.length - 1];

    return {
      carrier: "tpc",
      trackingNumber: cleaned,
      status: latest.status,
      events,
      fetchedAt: new Date().toISOString(),
      raw: { source: "mobile-feed", url },
    };
  },
};
