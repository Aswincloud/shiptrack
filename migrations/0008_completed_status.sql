-- Backfill: rows that the poller previously marked as 'cancelled' because the
-- shipment reached a terminal carrier status (delivered / returned) should be
-- 'completed' instead. The user didn't cancel them — the shipment finished.
--
-- We can identify these rows by the mismatch between status='cancelled' and a
-- terminal last_known_status. User-cancelled rows typically have a non-terminal
-- last_known_status (or NULL).
UPDATE watches
SET status = 'completed'
WHERE status = 'cancelled'
  AND last_known_status IN ('delivered', 'returned');
