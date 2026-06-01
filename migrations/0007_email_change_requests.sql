-- Self-service email change requests. The user submits a desired email, an
-- admin reviews and approves or rejects. status enum: 'pending' (default),
-- 'approved', 'rejected', 'cancelled'. The unique partial index keeps one
-- open request per user at a time.

CREATE TABLE IF NOT EXISTS email_change_requests (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  current_email TEXT NOT NULL,
  requested_email TEXT NOT NULL COLLATE NOCASE,
  status TEXT NOT NULL DEFAULT 'pending',
  reason TEXT,
  decided_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  decided_at INTEGER,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_ecr_user ON email_change_requests(user_id);
CREATE INDEX IF NOT EXISTS idx_ecr_status ON email_change_requests(status);
CREATE UNIQUE INDEX IF NOT EXISTS idx_ecr_one_pending_per_user
  ON email_change_requests(user_id) WHERE status = 'pending';
