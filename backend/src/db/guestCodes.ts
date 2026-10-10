import { randomInt } from 'node:crypto';
import { db } from './connection.js';
import { insertGuest, type UserRow } from './users.js';

/** No 0/O, 1/I/L: the code gets read off a screen or a printed card. */
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 8;
const LIFETIME_DAYS = 7;

export interface GuestCodeRow {
  id: number;
  code: string;
  created_by: number | null;
  created_at: string;
  expires_at: string;
  used_at: string | null;
  used_by: number | null;
}

export interface GuestCodeListing {
  id: number;
  code: string;
  createdAt: string;
  expiresAt: string;
  usedAt: string | null;
  usedBy: string | null;
  status: 'active' | 'used' | 'expired';
}

/** Upper-cases and drops non-alphabet characters, so `abcd-efgh` and `ABCDEFGH` match. Shown as `ABCD-EFGH`. */
export function normalizeGuestCode(input: unknown): string {
  if (typeof input !== 'string') return '';
  return input.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

export function createGuestCode(createdBy: number): GuestCodeRow {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    let code = '';
    for (let i = 0; i < CODE_LENGTH; i += 1) code += ALPHABET[randomInt(ALPHABET.length)];

    const result = db
      .prepare(
        `INSERT OR IGNORE INTO guest_codes (code, created_by, expires_at)
         VALUES (?, ?, datetime('now', ?))`,
      )
      .run(code, createdBy, `+${LIFETIME_DAYS} days`);

    if (result.changes === 1) {
      return db.prepare('SELECT * FROM guest_codes WHERE id = ?').get(result.lastInsertRowid) as GuestCodeRow;
    }
  }

  throw new Error('Could not allocate a unique guest code');
}

/** Read-only twin of `redeemGuestCode`'s check, for refusing before any work is done. */
export function isRedeemableGuestCode(input: unknown): boolean {
  const code = normalizeGuestCode(input);
  if (code.length !== CODE_LENGTH) return false;
  return (
    db
      .prepare("SELECT 1 FROM guest_codes WHERE code = ? AND used_at IS NULL AND expires_at > datetime('now')")
      .get(code) !== undefined
  );
}

/**
 * Mints a guest and burns the code in one transaction, so racing devices get one guest and a spent code leaves no
 * orphan. Undefined when the code is unknown, used or expired.
 */
export const redeemGuestCode = db.transaction((input: unknown): UserRow | undefined => {
  const code = normalizeGuestCode(input);
  if (code.length !== CODE_LENGTH) return undefined;

  const row = db
    .prepare(
      `SELECT id FROM guest_codes
        WHERE code = ? AND used_at IS NULL AND expires_at > datetime('now')`,
    )
    .get(code) as { id: number } | undefined;
  if (!row) return undefined;

  const guest = insertGuest();
  db.prepare("UPDATE guest_codes SET used_at = datetime('now'), used_by = ? WHERE id = ?").run(guest.id, row.id);
  return guest;
});

/** Live codes first, then the last 30 days of used and expired ones. */
export function listGuestCodes(): GuestCodeListing[] {
  const rows = db
    .prepare(
      `SELECT g.id, g.code, g.created_at, g.expires_at, g.used_at, u.username AS used_by_name,
              CASE WHEN g.used_at IS NOT NULL THEN 'used'
                   WHEN g.expires_at <= datetime('now') THEN 'expired'
                   ELSE 'active' END AS status
         FROM guest_codes g
         LEFT JOIN users u ON u.id = g.used_by
        WHERE g.created_at > datetime('now', '-30 days')
        ORDER BY status = 'active' DESC, g.created_at DESC, g.id DESC`,
    )
    .all() as {
    id: number;
    code: string;
    created_at: string;
    expires_at: string;
    used_at: string | null;
    used_by_name: string | null;
    status: GuestCodeListing['status'];
  }[];

  return rows.map((row) => ({
    id: row.id,
    code: row.code,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    usedAt: row.used_at,
    usedBy: row.used_by_name,
    status: row.status,
  }));
}

export function deleteGuestCode(id: number): boolean {
  return db.prepare('DELETE FROM guest_codes WHERE id = ?').run(id).changes > 0;
}

/** Off unless an admin turned it on: the LAN posture (A15) stays an open door. */
export function guestCodesRequired(): boolean {
  const row = db.prepare("SELECT value FROM server_settings WHERE key = 'guest_codes_required'").get() as
    | { value: string }
    | undefined;
  return row?.value === '1';
}

export function setGuestCodesRequired(required: boolean): void {
  db.prepare(
    `INSERT INTO server_settings (key, value) VALUES ('guest_codes_required', ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
  ).run(required ? '1' : '0');
}
