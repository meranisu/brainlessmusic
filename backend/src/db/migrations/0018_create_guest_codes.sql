-- Per-guest entry codes (A42/A43). An admin makes one on the web Users page,
-- hands it to one person, and it lets exactly one device in: redeeming it mints
-- a guest and stamps `used_at`/`used_by`. Unused, it stops working at
-- `expires_at` (7 days after it was made).
--
-- Rows outlive their use on purpose, so the panel can say who came in on which
-- code. `created_by`/`used_by` are nulled, not cascaded, when that user is
-- deleted or pruned (see `deleteUser` / `pruneIdleGuests`), matching the rest
-- of the schema: foreign keys are enforced, none of them cascade.
CREATE TABLE IF NOT EXISTS guest_codes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL UNIQUE,
  created_by INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at TEXT NOT NULL,
  used_at TEXT,
  used_by INTEGER REFERENCES users(id)
);

-- Server-wide switches an admin flips from the web, where an env var would
-- mean editing `.env` on the server and restarting. One row per key; a missing
-- row means the default. First key: `guest_codes_required` ('1' or '0').
CREATE TABLE IF NOT EXISTS server_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
