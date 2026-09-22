-- Opt-in WhatsApp alerts. One linked number per account, applied to every watch
-- the account owns. Guests (user_id IS NULL) never get WhatsApp: there is no
-- account to link a number to.
--
-- Linking is "message us first": Settings hands the user a short code, they
-- send "VERIFY <code>" to our business number from WhatsApp, Meta's webhook
-- delivers it with the sender's number, and that number is bound to the
-- account. The user never types a number, so it cannot be mistyped or someone
-- else's — proof and capture are the same event. Meta requires opt-in before
-- business-initiated messages; an inbound message is the strongest form.
--
-- phone             E.164 digits, no "+", exactly as Meta reports the sender.
-- phone_verified_at When the linking message arrived.
-- whatsapp_opt_in   1 on link; the owner (or an inbound STOP/START) toggles it.
--                   The poller sends only when verified AND opted in.
ALTER TABLE users ADD COLUMN phone TEXT;
ALTER TABLE users ADD COLUMN phone_verified_at INTEGER;
ALTER TABLE users ADD COLUMN whatsapp_opt_in INTEGER NOT NULL DEFAULT 0;
-- The webhook resolves a sender to an account by number (STOP/START, replies).
CREATE INDEX IF NOT EXISTS idx_users_phone ON users(phone);

-- One outstanding link code per user. Not a secret in the OTP sense — the user
-- is the one who sends it to us — so it is stored as-is; what it proves is
-- which account a given inbound message belongs to. Short TTL keeps the code
-- space (6 digits) comfortably collision-free at any plausible signup rate.
CREATE TABLE IF NOT EXISTS phone_verifications (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_phone_verifications_code ON phone_verifications(code);
