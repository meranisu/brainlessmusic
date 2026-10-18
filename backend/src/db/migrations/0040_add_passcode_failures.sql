-- Wrong passcode sign-ins since the last password sign-in (A216, S3). At 10 the passcode stops working until the
-- account signs in with its password or sets a new passcode. Kept in the DB, not the in-memory limiter, so a restart
-- does not hand a guesser a fresh budget.
ALTER TABLE users ADD COLUMN passcode_failures INTEGER NOT NULL DEFAULT 0;
-- Passcodes now need 6 to 8 digits. A hash cannot show its length, so every existing one is cleared and each account
-- sets a new one.
UPDATE users SET passcode_hash = NULL;
