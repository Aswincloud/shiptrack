-- Lifetime count of watches an account has created. The admin table's existing
-- "watches" figure is a live COUNT of active rows, which drops to zero as soon
-- as a user's shipments are delivered — and delivered watches are purged 7 days
-- later, so even a COUNT(*) would decay. A counter on the user is the only
-- number that keeps meaning "how many watches has this person set up, ever".
--
-- Incremented by createWatch() in the same batch as the INSERT. Backfilled from
-- the rows that still exist; anything already purged is unrecoverable.
ALTER TABLE users ADD COLUMN watches_created INTEGER NOT NULL DEFAULT 0;

UPDATE users
SET watches_created = (SELECT COUNT(*) FROM watches WHERE watches.user_id = users.id);
