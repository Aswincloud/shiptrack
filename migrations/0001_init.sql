CREATE TABLE IF NOT EXISTS watches (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  carrier TEXT NOT NULL,
  tracking_number TEXT NOT NULL,
  label TEXT,
  status TEXT NOT NULL,
  last_known_status TEXT,
  last_event_hash TEXT,
  last_polled_at INTEGER,
  created_at INTEGER NOT NULL,
  confirmed_at INTEGER
);

CREATE INDEX IF NOT EXISTS idx_watches_due ON watches(status, last_polled_at);
CREATE INDEX IF NOT EXISTS idx_watches_email ON watches(email);

CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  watch_id TEXT NOT NULL REFERENCES watches(id) ON DELETE CASCADE,
  status TEXT NOT NULL,
  description TEXT,
  location TEXT,
  timestamp TEXT,
  recorded_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_events_watch ON events(watch_id);
