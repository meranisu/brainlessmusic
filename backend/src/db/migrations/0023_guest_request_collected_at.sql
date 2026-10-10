-- When the device first collected an approved request (G1). For a few minutes after, the same secret can collect it
-- again, so an answer lost on the way (dropped signal, overlapping polls) doesn't strand the new guest.
ALTER TABLE guest_code_requests ADD COLUMN collected_at TEXT;
