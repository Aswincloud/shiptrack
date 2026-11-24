-- Generic fixed-window rate limiting for abuse-prone endpoints: login, signup,
-- forgot-password, OTP verify/resend, and inbound WhatsApp VERIFY guesses.
-- One row per counted event. `key` names the limit and its subject, e.g.
-- "login:ip:203.0.113.7" or "signup:email:a@b.com". The poller deletes rows
-- older than a day (see purgeExpiredPhoneOtps), which also bounds table size.
CREATE TABLE IF NOT EXISTS rate_events (
  key        TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_rate_events_key_time ON rate_events(key, created_at);
