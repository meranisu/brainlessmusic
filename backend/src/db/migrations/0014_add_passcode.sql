-- An optional 4-8 digit passcode per account, set from Options. It adds a way in; the password stays.
ALTER TABLE users ADD COLUMN passcode_hash TEXT;
