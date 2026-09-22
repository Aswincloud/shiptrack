// Guess which carriers could own a tracking number from its shape alone.
//
// Indian courier IDs overlap heavily — Blue Dart, Delhivery, Amazon Shipping
// and ST Courier are all plain digit strings of similar length — so this
// returns an ordered list of *candidates*, not a single answer. The caller
// queries them and keeps the first that resolves.
//
// Patterns mirror each carrier's own `invalid_input` check so we never send a
// number a carrier would reject outright. Order within a group is by how
// common the carrier is for that shape; Shiprocket is always last because it
// accepts almost anything and only resolves shipments booked through it.

const CANDIDATES: { id: string; pattern: RegExp; skipInAuto?: boolean }[] = [
  // Letter prefix + digits: TPC consignment numbers (e.g. "CHE123456789").
  { id: "tpc", pattern: /^[A-Z]{2,5}[0-9]{4,15}$/i },
  // Digit-only shapes, most-specific length ranges first.
  { id: "amazon", pattern: /^[0-9]{10,18}$/ },
  // Delhivery's public API only resolves shipments booked under the operator's
  // own account (`privateOnly` in the registry), so for a visitor it is a
  // guaranteed not-found: a wasted upstream call on every 11-14 digit lookup.
  // Auto mode skips it; the operator picks it from the list for their own parcels.
  { id: "delhivery", pattern: /^[0-9]{11,14}$/, skipInAuto: true },
  { id: "bluedart", pattern: /^[0-9]{6,20}$/ },
  { id: "stcourier", pattern: /^[0-9]{6,11}$/ },
  // Anything alphanumeric can be a Shiprocket AWB.
  { id: "shiprocket", pattern: /^[A-Za-z0-9-]{6,30}$/ },
];

export const AUTO_CARRIER = "auto";

export function detectCarriers(trackingNumber: string): string[] {
  const id = trackingNumber.trim();
  if (!id) return [];
  return CANDIDATES.filter((c) => !c.skipInAuto && c.pattern.test(id)).map((c) => c.id);
}
