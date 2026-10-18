import { randomCode } from '../utils/randomCode.js';
import { db, lazyTransaction } from './connection.js';
import { deleteUser, findUserById, insertGuest, type UserRow } from './users.js';

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
  /** The guest's internal `username`. */
  usedBy: string | null;
  /** The guest's display name. */
  usedByName: string | null;
  status: 'active' | 'used' | 'expired';
  /** Newest first, at most 20. */
  signins: GuestCodeSignin[];
}

export interface GuestCodeSignin {
  at: string;
  platform: string | null;
  userAgent: string | null;
  ip: string | null;
}

/** Upper-cases and drops non-alphabet characters, so `abcd-efgh` and `ABCDEFGH` match. Shown as `ABCD-EFGH`. */
export function normalizeGuestCode(input: unknown): string {
  if (typeof input !== 'string') return '';
  return input.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

export function createGuestCode(createdBy: number): GuestCodeRow {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const code = randomCode(ALPHABET, CODE_LENGTH);

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

export type GuestCodeState = 'fresh' | 'bound';

/**
 * Read-only twin of `claimGuestCode`'s check, for refusing before any work is done: `fresh` would mint a guest (so the
 * cap applies), `bound` signs in as an existing one. Undefined when the code can't be used.
 */
export function peekGuestCode(input: unknown, idleDays: number): GuestCodeState | undefined {
  const code = normalizeGuestCode(input);
  if (code.length !== CODE_LENGTH) return undefined;
  const row = db.prepare('SELECT * FROM guest_codes WHERE code = ?').get(code) as GuestCodeRow | undefined;
  return row ? stateOf(row, idleDays) : undefined;
}

function stateOf(row: GuestCodeRow, idleDays: number): GuestCodeState | undefined {
  if (row.used_at === null) {
    return row.expires_at > sqliteNow() ? 'fresh' : undefined;
  }
  // Used: it is that guest's key until revoked, or until the guest has gone unseen for `idleDays` (A70). A pruned or
  // deleted guest leaves `used_by` NULL, and the code with it.
  if (row.used_by === null) return undefined;
  const idle = db
    .prepare(
      `SELECT 1 FROM users
        WHERE id = ? AND COALESCE(last_seen_at, created_at) < datetime('now', ?)`,
    )
    .get(row.used_by, `-${idleDays} days`);
  return idle ? undefined : 'bound';
}

function sqliteNow(): string {
  return (db.prepare("SELECT datetime('now') AS now").get() as { now: string }).now;
}

export interface ClaimedGuest {
  user: UserRow;
  codeId: number;
  minted: boolean;
}

/**
 * Signs in with a guest code (A69): a fresh code mints a guest named `displayName` and binds to it; a bound code
 * returns its guest and ignores the name (A68). One transaction, so racing devices on a fresh code get one guest.
 * Undefined when the code can't be used.
 */
export const claimGuestCode = lazyTransaction(
  (input: unknown, displayName: string, idleDays: number): ClaimedGuest | undefined => {
    const code = normalizeGuestCode(input);
    if (code.length !== CODE_LENGTH) return undefined;

    const row = db.prepare('SELECT * FROM guest_codes WHERE code = ?').get(code) as GuestCodeRow | undefined;
    if (!row) return undefined;

    const state = stateOf(row, idleDays);
    if (state === 'bound') {
      return { user: findUserById(row.used_by!)!, codeId: row.id, minted: false };
    }
    if (state !== 'fresh') return undefined;

    const guest = insertGuest(displayName);
    db.prepare("UPDATE guest_codes SET used_at = datetime('now'), used_by = ? WHERE id = ?").run(guest.id, row.id);
    return { user: guest, codeId: row.id, minted: true };
  },
);

export interface SigninDetails {
  platform: string | null;
  userAgent: string | null;
  ip: string | null;
}

/** One row per sign-in with a code (A69). */
export function recordGuestCodeSignin(codeId: number, details: SigninDetails): void {
  db.prepare('INSERT INTO guest_code_signins (code_id, platform, user_agent, ip) VALUES (?, ?, ?, ?)').run(
    codeId,
    details.platform,
    details.userAgent?.slice(0, USER_AGENT_MAX) ?? null,
    details.ip,
  );
}

const USER_AGENT_MAX = 200;
/** Sign-ins listed per code; older ones stay in the table. */
const SIGNINS_LISTED = 20;

/**
 * Unused codes still live and every code bound to a guest that exists, then the last 30 days of the rest. A used code
 * whose guest is gone reads as `expired`.
 */
export function listGuestCodes(): GuestCodeListing[] {
  const rows = db
    .prepare(
      `SELECT g.id, g.code, g.created_at, g.expires_at, g.used_at, u.username AS used_by_name,
              COALESCE(u.display_name, u.username) AS used_by_display_name,
              CASE WHEN g.used_at IS NOT NULL AND u.id IS NOT NULL THEN 'used'
                   WHEN g.used_at IS NULL AND g.expires_at > datetime('now') THEN 'active'
                   ELSE 'expired' END AS status
         FROM guest_codes g
         LEFT JOIN users u ON u.id = g.used_by
        WHERE g.created_at > datetime('now', '-30 days')
           OR u.id IS NOT NULL
           OR (g.used_at IS NULL AND g.expires_at > datetime('now'))
        ORDER BY status = 'active' DESC, g.created_at DESC, g.id DESC`,
    )
    .all() as {
    id: number;
    code: string;
    created_at: string;
    expires_at: string;
    used_at: string | null;
    used_by_name: string | null;
    used_by_display_name: string | null;
    status: GuestCodeListing['status'];
  }[];

  const signins = db.prepare(
    `SELECT platform, user_agent, ip, created_at FROM guest_code_signins
      WHERE code_id = ? ORDER BY created_at DESC, id DESC LIMIT ?`,
  );

  return rows.map((row) => ({
    id: row.id,
    code: row.code,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    usedAt: row.used_at,
    usedBy: row.used_by_name,
    usedByName: row.used_by_display_name,
    status: row.status,
    signins: (
      signins.all(row.id, SIGNINS_LISTED) as {
        platform: string | null;
        user_agent: string | null;
        ip: string | null;
        created_at: string;
      }[]
    ).map((signin) => ({
      at: signin.created_at,
      platform: signin.platform,
      userAgent: signin.user_agent,
      ip: signin.ip,
    })),
  }));
}

/**
 * Deletes a code, and on a used one revokes it (A69): its guest is deleted with its data, so every device using it is
 * refused on its next request (`rejectDeletedUser`). False when there is no such code.
 */
export const deleteGuestCode = lazyTransaction((id: number): boolean => {
  const row = db.prepare('SELECT used_by FROM guest_codes WHERE id = ?').get(id) as
    | { used_by: number | null }
    | undefined;
  if (!row) return false;

  if (row.used_by !== null) deleteUser(row.used_by);
  db.prepare('DELETE FROM guest_code_signins WHERE code_id = ?').run(id);
  db.prepare('UPDATE guest_code_requests SET code_id = NULL WHERE code_id = ?').run(id);
  return db.prepare('DELETE FROM guest_codes WHERE id = ?').run(id).changes > 0;
});

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
