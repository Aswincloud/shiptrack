-- Per-watch poll interval. Default 14 minutes matches the prior global
-- POLL_INTERVAL_SECONDS in the poller (the cron fires every 15 min, so the
-- value is 14 to ensure a row is always due on the next cron tick).
ALTER TABLE watches ADD COLUMN poll_interval_seconds INTEGER NOT NULL DEFAULT 840;
