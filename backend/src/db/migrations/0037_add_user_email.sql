-- An account's email (A189/A190), stored lowercase. Required when signing up from an invite; accounts made before this
-- are asked to add one. Sign-in takes it in place of the username (A192). Nothing sends mail to it yet: a password reset
-- by email is a later feature. Guests never have one.
ALTER TABLE users ADD COLUMN email TEXT;
CREATE UNIQUE INDEX users_email_unique ON users(email) WHERE email IS NOT NULL;
