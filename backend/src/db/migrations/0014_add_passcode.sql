-- A short numeric passcode, bound to an account, as an alternative to typing
-- a username and password — the arcade-card-PIN idea from the account-select
-- screen. NULL means "no passcode set", the default for every existing row
-- and every new account until they choose to create one from Options.
--
-- Kept alongside `password_hash` rather than replacing it: a passcode is
-- optional and much shorter, so it widens what can sign an account in rather
-- than substituting for the thing that actually secures it.
ALTER TABLE users ADD COLUMN passcode_hash TEXT;
