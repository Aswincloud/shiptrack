-- Per-user API keys, so an account can manage its own watches from a script
-- (POST /api/watches with "Authorization: Bearer st_…") instead of only from
-- the dashboard. A key acts as its owner, with the same caps and confirmation
-- rules as a signed-in session.
--
-- The key itself is shown once, at creation, and only its SHA-256 is stored —
-- it is a credential, like a password. `prefix` (the first characters after
-- "st_") is kept in clear so Settings can tell keys apart. Revoking sets
-- revoked_at; the row stays so the list can show what existed. Deleting the
-- account deletes its keys (ON DELETE CASCADE, as for watches).
CREATE TABLE IF NOT EXISTS api_keys (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  prefix TEXT NOT NULL,
  key_hash TEXT NOT NULL UNIQUE,
  created_at INTEGER NOT NULL,
  last_used_at INTEGER,
  revoked_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_api_keys_user ON api_keys(user_id);
