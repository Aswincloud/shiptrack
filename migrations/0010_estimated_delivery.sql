-- Carrier's expected delivery date for a watched shipment, as the carrier
-- renders it (e.g. "28 Aug 2026"). Kept as TEXT rather than a date: each
-- carrier formats it differently and we only ever display it verbatim, the
-- same way the public tracking page already does.
--
-- Refreshed on every successful poll, so the dashboard can show it without
-- re-fetching from the carrier, and the alert email can include it.
ALTER TABLE watches ADD COLUMN estimated_delivery TEXT;
