-- Track when a watch reached its terminal (completed) state, so we can purge
-- delivered/returned watches 7 days later. Distinct from confirmed_at (when the
-- watch became active) and last_polled_at (every poll touches that).
ALTER TABLE watches ADD COLUMN completed_at INTEGER;

-- Backfill: existing completed rows didn't record a completion time. Use their
-- last poll as the best available proxy for when delivery was detected. Rows
-- with no last_polled_at fall back to created_at so the grace clock still runs.
UPDATE watches
SET completed_at = COALESCE(last_polled_at, created_at)
WHERE status = 'completed' AND completed_at IS NULL;

-- Index to make the purge sweep cheap.
CREATE INDEX IF NOT EXISTS idx_watches_completed ON watches(status, completed_at);
