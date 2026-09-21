// Carrier scan timestamps arrive as whatever string the carrier renders:
//   Amazon      "Sep 20, 2026, 10:35:21 AM"
//   Delhivery   "2026-09-20T10:35:21" (sometimes with a zone or millis)
//   TPC         "08 Sep 2026 10:48:00"
//   Blue Dart   "<date cell> <time cell>" e.g. "20-Sep-2026 10:35"
//   ST Courier / Shiprocket   "<date> <time>" in DD-MM-YYYY or DD/MM/YYYY
//
// The raw string is kept on TrackingEvent.timestamp untouched — the poller's
// last_event_hash is built from it, so changing it would fire a spurious
// "status changed" email to every watcher. This module only *interprets* it
// for display. Every carrier here is Indian, so a time without an explicit
// zone is taken as IST (+05:30). Anything unrecognised returns null and the
// UI falls back to the raw string.

const IST_OFFSET_MIN = 5 * 60 + 30;
const MONTHS: Record<string, number> = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, sept: 8, oct: 9, nov: 10, dec: 11,
};

function fromIst(y: number, mo: number, d: number, h = 0, mi = 0, s = 0): number {
  return Date.UTC(y, mo, d, h, mi, s) - IST_OFFSET_MIN * 60_000;
}

function applyMeridiem(h: number, ampm?: string): number {
  if (!ampm) return h;
  const p = ampm.toLowerCase();
  if (p === "pm" && h < 12) return h + 12;
  if (p === "am" && h === 12) return 0;
  return h;
}

const TIME = String.raw`(?:[ ,T]+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(am|pm)?)?`;
// DD-MM-YYYY, DD/MM/YYYY, DD.MM.YYYY
const RE_DMY_NUM = new RegExp(String.raw`^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})${TIME}$`, "i");
// DD-MMM-YYYY, DD MMM YYYY, DD MMM, YYYY
const RE_DMY_MON = new RegExp(String.raw`^(\d{1,2})[-\s]([A-Za-z]{3,4})[-\s,]+(\d{4})${TIME}$`, "i");
// MMM DD, YYYY (Amazon)
const RE_MDY_MON = new RegExp(String.raw`^([A-Za-z]{3,9})\s+(\d{1,2}),?\s+(\d{4})${TIME}$`, "i");
// YYYY-MM-DD HH:mm[:ss] (no zone)
const RE_YMD = new RegExp(String.raw`^(\d{4})-(\d{2})-(\d{2})${TIME}$`, "i");
// Full ISO with zone designator: let Date handle it.
const RE_ISO_ZONED = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})$/;
// ISO without zone, possibly with millis: strip millis, treat as IST.
const RE_ISO_NAIVE = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?(?:\.\d+)?$/;

export function parseCarrierDate(raw: string | undefined | null): Date | null {
  if (!raw) return null;
  const s = raw.trim().replace(/\s+/g, " ");
  if (!s) return null;

  let m: RegExpMatchArray | null;

  if (RE_ISO_ZONED.test(s)) {
    const t = Date.parse(s);
    return Number.isFinite(t) ? new Date(t) : null;
  }
  if ((m = s.match(RE_ISO_NAIVE))) {
    return new Date(fromIst(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], m[6] ? +m[6] : 0));
  }
  if ((m = s.match(RE_YMD))) {
    return new Date(fromIst(+m[1], +m[2] - 1, +m[3], applyMeridiem(+(m[4] ?? 0), m[7]), +(m[5] ?? 0), +(m[6] ?? 0)));
  }
  if ((m = s.match(RE_DMY_NUM))) {
    return new Date(fromIst(+m[3], +m[2] - 1, +m[1], applyMeridiem(+(m[4] ?? 0), m[7]), +(m[5] ?? 0), +(m[6] ?? 0)));
  }
  if ((m = s.match(RE_DMY_MON))) {
    const mo = MONTHS[m[2].toLowerCase().slice(0, 4)] ?? MONTHS[m[2].toLowerCase().slice(0, 3)];
    if (mo === undefined) return null;
    return new Date(fromIst(+m[3], mo, +m[1], applyMeridiem(+(m[4] ?? 0), m[7]), +(m[5] ?? 0), +(m[6] ?? 0)));
  }
  if ((m = s.match(RE_MDY_MON))) {
    const mo = MONTHS[m[1].toLowerCase().slice(0, 3)];
    if (mo === undefined) return null;
    return new Date(fromIst(+m[3], mo, +m[2], applyMeridiem(+(m[4] ?? 0), m[7]), +(m[5] ?? 0), +(m[6] ?? 0)));
  }
  return null;
}

const DATE_FMT = new Intl.DateTimeFormat("en-IN", {
  timeZone: "Asia/Kolkata",
  day: "numeric",
  month: "short",
  year: "numeric",
});
const TIME_FMT = new Intl.DateTimeFormat("en-IN", {
  timeZone: "Asia/Kolkata",
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
});

// "20 Sept 2026, 10:35 am IST". Always IST: that is the zone every carrier
// stamps in, and showing a Bhiwandi scan in the viewer's zone would confuse
// more than it helps.
export function formatCarrierDate(d: Date, withTime = true): string {
  const date = DATE_FMT.format(d).replace("Sept", "Sep");
  if (!withTime) return date;
  return `${date}, ${TIME_FMT.format(d).replace(/\s?(am|pm)/, " $1")} IST`;
}

// Coarse relative phrase for "how fresh is this scan". Deliberately rounds
// hard — "3 h ago" is what people want to know, not "2 h 47 min ago".
export function relativeTime(d: Date, now: Date = new Date()): string {
  const diff = now.getTime() - d.getTime();
  const abs = Math.abs(diff);
  const future = diff < 0;
  const min = Math.round(abs / 60_000);
  let phrase: string;
  if (min < 1) phrase = "just now";
  else if (min < 60) phrase = `${min} min`;
  else if (min < 60 * 24) phrase = `${Math.round(min / 60)} h`;
  else if (min < 60 * 24 * 14) phrase = `${Math.round(min / (60 * 24))} d`;
  else phrase = `${Math.round(min / (60 * 24 * 7))} wk`;
  if (phrase === "just now") return phrase;
  return future ? `in ${phrase}` : `${phrase} ago`;
}

// Display pair for a raw carrier string: normalised text when parseable,
// otherwise the raw string as-is.
export function displayCarrierDate(raw: string | undefined | null): { text: string; date: Date | null } {
  const date = parseCarrierDate(raw);
  return { text: date ? formatCarrierDate(date) : (raw ?? "").trim(), date };
}
