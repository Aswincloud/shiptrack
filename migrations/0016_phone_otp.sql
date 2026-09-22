-- "Enter your number instead": a second way to link a WhatsApp number in
-- Settings, for a desktop without WhatsApp on it. We send a one-time code to
-- the typed number (Meta's shiptrack_verify authentication template) and the
-- user types it back. The message-first path stays the default; both end in
-- users.phone / phone_verified_at.
--
-- Unlike the message-first code (which the user sends TO us and so is not a
-- secret), this code is a credential — whoever knows it can claim the number —
-- so it is stored hashed (sha256 with TOKEN_SECRET as pepper, the same scheme
-- as the email OTP), limited to 5 attempts, and expires after 10 minutes to
-- match the template's own footer. The phone it was sent to is recorded so a
-- number changed mid-flow can't be verified with a code that went elsewhere.
CREATE TABLE IF NOT EXISTS phone_otp_codes (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  phone TEXT NOT NULL,
  code_hash TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);

-- Every send, for rate limiting: per account and per destination number per
-- day, so no account can spray codes at strangers from the support number.
-- Rows older than a day are swept by the poller.
CREATE TABLE IF NOT EXISTS phone_otp_sends (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  phone TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_phone_otp_sends_user ON phone_otp_sends(user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_phone_otp_sends_phone ON phone_otp_sends(phone, created_at);
