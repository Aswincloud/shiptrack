-- Guest WhatsApp alerts by one-time code. A signed-out visitor on a
-- "not found yet" page types their number, we send shiptrack_verify, they type
-- the code back, and an active guest watch with that number is created.
--
-- One pending code per (phone, carrier, tracking number). The code is a
-- credential (whoever knows it claims the number for this shipment), so it is
-- stored hashed like phone_otp_codes. Rate limiting reuses phone_otp_sends,
-- with user_id = 'guest:<ip>' so per-IP and per-number limits share one log.
CREATE TABLE IF NOT EXISTS guest_phone_otp_codes (
  id TEXT PRIMARY KEY,
  phone TEXT NOT NULL,
  carrier TEXT NOT NULL,
  tracking_number TEXT NOT NULL,
  label TEXT,
  code_hash TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_guest_phone_otp_lookup ON guest_phone_otp_codes(phone, carrier, tracking_number);
