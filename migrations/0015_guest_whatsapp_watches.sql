-- A watch can carry its own verified WhatsApp number. Used by signed-out
-- visitors on the "not found yet" page: instead of leaving an email they tap
-- a wa.me link, send "VERIFY <code>" from WhatsApp, and the inbound message
-- both proves the number and confirms the watch — so it activates with no
-- email and no confirmation link. Such rows have email = '' (the column is NOT
-- NULL from 0001); every sender checks `w.email` before mailing.
--
-- phone / phone_verified_at mirror the same columns on users. The poller
-- prefers the watch's own number, then the owning account's linked number.
ALTER TABLE watches ADD COLUMN phone TEXT;
ALTER TABLE watches ADD COLUMN phone_verified_at INTEGER;
CREATE INDEX IF NOT EXISTS idx_watches_phone ON watches(phone);

-- Outstanding link code for a watch, same shape and TTL as phone_verifications
-- (which is keyed by user). Codes are minted unique across both tables so an
-- inbound code resolves to exactly one thing.
CREATE TABLE IF NOT EXISTS watch_phone_verifications (
  watch_id TEXT PRIMARY KEY REFERENCES watches(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_watch_phone_verifications_code ON watch_phone_verifications(code);
