-- Admin-side tidy-up for the "Guest watch requests" list. Cancelled guest
-- watches are never purged (only completed ones are), so a request from May
-- sits at the bottom of the list for good. Hiding a row moves it into a
-- collapsed "Hidden" section on the dashboard and nothing else: it does not
-- cancel the watch or stop the poller. NULL = visible.
ALTER TABLE watches ADD COLUMN admin_hidden_at INTEGER;
