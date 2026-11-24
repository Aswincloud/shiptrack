// The tracking-number format each carrier accepts, after that carrier's own
// normalisation (trim; upper-case for Ekart and TPC). This is the single source
// of truth: each carrier's track() rejects anything that fails it, and creating
// a watch checks it too, so a watch can only ever be made for a number its
// carrier could actually track — never free text an attacker wants to see
// repeated in an email we send.
const FORMATS: Record<string, { pattern: RegExp; upper?: boolean }> = {
  amazon: { pattern: /^[0-9]{10,18}$/ },
  bluedart: { pattern: /^[0-9]{6,20}$/ },
  delhivery: { pattern: /^[0-9]{8,20}$/ },
  ekart: { pattern: /^[A-Z]{2,6}[0-9]{6,14}$/, upper: true },
  shiprocket: { pattern: /^[A-Za-z0-9-]{6,30}$/ },
  stcourier: { pattern: /^[0-9]{6,11}$/ },
  tpc: { pattern: /^[A-Z0-9]{6,20}$/, upper: true },
};

// Own keys only, so an inherited name like "constructor" is an unknown carrier.
function formatFor(carrier: string): { pattern: RegExp; upper?: boolean } | undefined {
  const key = carrier.toLowerCase();
  return Object.prototype.hasOwnProperty.call(FORMATS, key) ? FORMATS[key] : undefined;
}

/** The carrier's normalised form of a tracking number. */
export function normaliseTrackingNumber(carrier: string, trackingNumber: string): string {
  const t = trackingNumber.trim();
  return formatFor(carrier)?.upper ? t.toUpperCase() : t;
}

/** True when the number matches the carrier's format. Unknown carriers fail. */
export function validTrackingNumber(carrier: string, trackingNumber: string): boolean {
  const f = formatFor(carrier);
  return !!f && f.pattern.test(normaliseTrackingNumber(carrier, trackingNumber));
}
