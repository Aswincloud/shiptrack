-- Consecutive failed polls for a watch (carrier error, upstream outage, AWB the
-- carrier still doesn't know). Reset to 0 on the next successful poll.
--
-- listDueWatches() stretches a watch's effective interval by 2^poll_failures,
-- capped at 96x (24 hours at the 15-minute minimum), so a waybill the carrier
-- has never heard of stops being fetched every tick forever while still being
-- retried often enough to notice when it finally appears.
ALTER TABLE watches ADD COLUMN poll_failures INTEGER NOT NULL DEFAULT 0;
