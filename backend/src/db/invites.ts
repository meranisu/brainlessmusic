import { createHash, randomBytes } from 'node:crypto';
import { db } from './connection.js';
import { findUserById, findUserByUsername, insertUser, nameOf, type UserRow } from './users.js';

/** One use, 7 days, like guest codes (A108). */
const LIFETIME_DAYS = 7;

export interface InviteRow {
  id: number;
  token_hash: string;
  created_by: number | null;
  guest_user_id: number | null;
  created_at: string;
  expires_at: string;
  used_at: string | null;
  used_by: number | null;
  revoked_at: string | null;
}

export type InviteStatus = 'open' | 'used' | 'expired' | 'revoked';

export interface InviteListing {
  id: number;
  createdAt: string;
  expiresAt: string;
  status: InviteStatus;
  /** Set on an upgrade invite: the guest it turns into an account. */
  guestUserId: number | null;
  guestName: string | null;
  /** The account that accepted it. */
  usedBy: string | null;
}

/** Only the hash is stored, so the link is shown once, when it is made. */
function hashToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

function sqliteNow(): string {
  return (db.prepare("SELECT datetime('now') AS now").get() as { now: string }).now;
}

function statusOf(row: InviteRow): InviteStatus {
  if (row.revoked_at !== null) return 'revoked';
  if (row.used_at !== null) return 'used';
  return row.expires_at > sqliteNow() ? 'open' : 'expired';
}

function findByToken(token: unknown): InviteRow | undefined {
  if (typeof token !== 'string' || token === '') return undefined;
  return db.prepare('SELECT * FROM account_invites WHERE token_hash = ?').get(hashToken(token)) as InviteRow | undefined;
}

/**
 * A new invite and its raw token, the only time the token exists. With `guestUserId`, an upgrade invite for that guest
 * (A107); one open upgrade invite per guest, so making a new one revokes the old. Undefined when the id is not a guest.
 */
export const createInvite = db.transaction(
  (createdBy: number, guestUserId: number | null): { invite: InviteRow; token: string } | undefined => {
    if (guestUserId !== null) {
      const guest = findUserById(guestUserId);
      if (!guest || guest.kind !== 'guest') return undefined;
      db.prepare(
        `UPDATE account_invites SET revoked_at = datetime('now')
          WHERE guest_user_id = ? AND used_at IS NULL AND revoked_at IS NULL`,
      ).run(guestUserId);
    }

    const token = randomBytes(24).toString('base64url');
    const result = db
      .prepare(
        `INSERT INTO account_invites (token_hash, created_by, guest_user_id, expires_at)
         VALUES (?, ?, ?, datetime('now', ?))`,
      )
      .run(hashToken(token), createdBy, guestUserId, `+${LIFETIME_DAYS} days`);

    const invite = db.prepare('SELECT * FROM account_invites WHERE id = ?').get(result.lastInsertRowid) as InviteRow;
    return { invite, token };
  },
);

/** Open invites, then the last 30 days of the rest, newest first. */
export function listInvites(): InviteListing[] {
  const rows = db
    .prepare(
      `SELECT i.*, g.username AS guest_username, g.display_name AS guest_display_name, u.username AS used_by_name
         FROM account_invites i
         LEFT JOIN users g ON g.id = i.guest_user_id
         LEFT JOIN users u ON u.id = i.used_by
        WHERE i.created_at > datetime('now', '-30 days')
           OR (i.used_at IS NULL AND i.revoked_at IS NULL AND i.expires_at > datetime('now'))
        ORDER BY i.created_at DESC, i.id DESC`,
    )
    .all() as (InviteRow & {
    guest_username: string | null;
    guest_display_name: string | null;
    used_by_name: string | null;
  })[];

  return rows.map((row) => ({
    id: row.id,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    status: statusOf(row),
    guestUserId: row.guest_user_id,
    guestName:
      row.guest_username === null ? null : nameOf({ username: row.guest_username, display_name: row.guest_display_name }),
    usedBy: row.used_by_name,
  }));
}

/** False when there is no such invite, or it is already used or revoked. */
export function revokeInvite(id: number): boolean {
  return (
    db
      .prepare(
        "UPDATE account_invites SET revoked_at = datetime('now') WHERE id = ? AND used_at IS NULL AND revoked_at IS NULL",
      )
      .run(id).changes > 0
  );
}

export interface InvitePeek {
  status: InviteStatus;
  expiresAt: string;
  /** The guest's display name on an upgrade invite, so the page can say whose account it becomes. */
  forGuest: string | null;
}

/** What the accept page shows. Undefined for a token that was never issued. */
export function peekInvite(token: unknown): InvitePeek | undefined {
  const row = findByToken(token);
  if (!row) return undefined;
  const guest = row.guest_user_id === null ? undefined : findUserById(row.guest_user_id);
  return { status: statusOf(row), expiresAt: row.expires_at, forGuest: guest ? nameOf(guest) : null };
}

/** A name the guest chose stays; the random `Guest 4821` doesn't, so the account shows its username. */
function keptDisplayName(displayName: string | null): string | null {
  return displayName === null || /^Guest \d{4}$/.test(displayName) ? null : displayName;
}

export type AcceptOutcome =
  | { ok: true; user: UserRow; upgraded: boolean }
  | { ok: false; reason: 'invalid' | 'taken' };

/**
 * Uses an invite, in one transaction so a link can't be spent twice. A fresh invite adds an account. An upgrade turns
 * the same guest row into an account (A107): name, password, `kind`, and the guest's codes deleted so they stop
 * signing anyone in. `session_version` is bumped so the guest's other devices sign out; the caller hands the accepting
 * device a new token. The password is hashed by the caller, before this runs, since a transaction can't await.
 */
export const acceptInvite = db.transaction(
  (token: unknown, username: string, passwordHash: string): AcceptOutcome => {
    const row = findByToken(token);
    if (!row || statusOf(row) !== 'open') return { ok: false, reason: 'invalid' };

    const clash = findUserByUsername(username);
    // An upgrading guest may not keep its `guest-` name (A112), so any clash is someone else.
    if (clash) return { ok: false, reason: 'taken' };

    let user: UserRow;
    if (row.guest_user_id !== null) {
      const guest = findUserById(row.guest_user_id);
      if (!guest || guest.kind !== 'guest') return { ok: false, reason: 'invalid' };

      db.prepare(
        `UPDATE users SET username = ?, password_hash = ?, kind = 'account', session_version = session_version + 1,
                display_name = ?
          WHERE id = ?`,
      ).run(username, passwordHash, keptDisplayName(guest.display_name), guest.id);

      const codeIds = db.prepare('SELECT id FROM guest_codes WHERE used_by = ?').all(guest.id) as { id: number }[];
      for (const { id } of codeIds) {
        db.prepare('DELETE FROM guest_code_signins WHERE code_id = ?').run(id);
        db.prepare('UPDATE guest_code_requests SET code_id = NULL WHERE code_id = ?').run(id);
        db.prepare('DELETE FROM guest_codes WHERE id = ?').run(id);
      }
      user = findUserById(guest.id)!;
    } else {
      user = insertUser(username, passwordHash);
    }

    db.prepare("UPDATE account_invites SET used_at = datetime('now'), used_by = ? WHERE id = ?").run(user.id, row.id);
    return { ok: true, user, upgraded: row.guest_user_id !== null };
  },
);
