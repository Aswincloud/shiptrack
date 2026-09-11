-- Backfill: rescue watches that reached a terminal carrier status but were left
-- 'active' by the poller.
--
-- Cause (fixed in workers/poller/index.ts alongside this migration): completion
-- was only evaluated on the new-event code path. ST Courier can report
-- "delivered" via its summary "Current Status" cell with zero parsed scan events
-- (older shipments whose detailed scans the carrier has dropped), so those
-- watches took the no-event early return: last_known_status was set to
-- 'delivered' but status was never set to 'completed'. They never moved to the
-- dashboard's "Delivered" section and kept polling every 15 minutes forever.
--
-- Mark any already-terminal-but-active watch completed now. Their true delivery
-- time is unknown, so completed_at is stamped to now (COALESCE guards any row
-- that already carries one); the 7-day purge window therefore starts here.
UPDATE watches
SET status = 'completed',
    completed_at = COALESCE(completed_at, CAST(strftime('%s', 'now') AS INTEGER))
WHERE status = 'active'
  AND last_known_status IN ('delivered', 'returned');
