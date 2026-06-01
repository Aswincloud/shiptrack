-- Display name shown in the dashboard / settings page. Optional; new sign-ups
-- can be created with NULL and the user can fill it in later.
ALTER TABLE users ADD COLUMN name TEXT;
