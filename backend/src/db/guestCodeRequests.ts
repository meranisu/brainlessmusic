import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { db, lazyTransaction } from './connection.js';
import { createGuestCode } from './guestCodes.js';
import { findUserById, insertGuest, type UserRow } from './users.js';

/**
 * "Request a code" from the guest screen (A67). The device gets an id and a secret, and polls with both; the admin
 * approves or denies from the Guest access card. Approving makes a code, binds it to a new guest, and the device
 * collects that guest's token once.
 */

/** A request nobody answered in this long stops counting, and the device is told it expired. */
const PENDING_HOURS = 24;
/** How long after the first collect the device can collect the same answer again, in case it never arrived (G1). */
const RECOLLECT_MINUTES = 10;
/** Rows of any status older than this are deleted when a new request comes in. */
const KEEP_DAYS = 7;

export interface GuestCodeRequestRow {
  id: number;
  name: string | null;
  platform: string | null;
  secret_hash: string;
  ip: string | null;
  created_at: string;
  status: 'pending' | 'approved' | 'denied' | 'collected';
  code_id: number | null;
  collected_at: string | null;
}

export interface PendingRequestListing {
  id: number;
  name: string | null;
  platform: string | null;
  ip: string | null;
  createdAt: string;
}

function hashSecret(secret: string): string {
  return createHash('sha256').update(secret, 'utf8').digest('hex');
}

const PENDING = `status = 'pending' AND created_at > datetime('now', '-${PENDING_HOURS} hours')`;

export function countPendingRequests(): number {
  return (db.prepare(`SELECT COUNT(*) AS count FROM guest_code_requests WHERE ${PENDING}`).get() as { count: number })
    .count;
}

/** Stores a request and returns the secret the device polls with. Only its hash is kept. */
export function createGuestCodeRequest(
  name: string,
  platform: string | null,
  ip: string | null,
): { id: number; secret: string } {
  db.prepare(`DELETE FROM guest_code_requests WHERE created_at < datetime('now', '-${KEEP_DAYS} days')`).run();

  const secret = randomBytes(24).toString('base64url');
  const result = db
    .prepare('INSERT INTO guest_code_requests (name, platform, secret_hash, ip) VALUES (?, ?, ?, ?)')
    .run(name || null, platform, hashSecret(secret), ip);
  return { id: Number(result.lastInsertRowid), secret };
}

export function listPendingRequests(): PendingRequestListing[] {
  const rows = db
    .prepare(`SELECT * FROM guest_code_requests WHERE ${PENDING} ORDER BY created_at, id`)
    .all() as GuestCodeRequestRow[];
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    platform: row.platform,
    ip: row.ip,
    createdAt: row.created_at,
  }));
}

/**
 * Approves a pending request: a new code, bound at once to a new guest with the requested name. False when the
 * request isn't pending (already answered, expired or unknown).
 */
export const approveGuestCodeRequest = lazyTransaction((id: number, adminId: number): boolean => {
  const row = db.prepare(`SELECT * FROM guest_code_requests WHERE id = ? AND ${PENDING}`).get(id) as
    | GuestCodeRequestRow
    | undefined;
  if (!row) return false;

  const code = createGuestCode(adminId);
  const guest = insertGuest(row.name ?? '');
  db.prepare("UPDATE guest_codes SET used_at = datetime('now'), used_by = ? WHERE id = ?").run(guest.id, code.id);
  db.prepare("UPDATE guest_code_requests SET status = 'approved', code_id = ? WHERE id = ?").run(code.id, id);
  return true;
});

export function denyGuestCodeRequest(id: number): boolean {
  return (
    db.prepare(`UPDATE guest_code_requests SET status = 'denied' WHERE id = ? AND ${PENDING}`).run(id).changes > 0
  );
}

/** The waiting device gives up: a pending request is deleted, so the admin isn't asked about it. Needs the secret. */
export function cancelGuestCodeRequest(id: number, secret: unknown): boolean {
  if (typeof secret !== 'string' || secret === '') return false;
  const row = db.prepare("SELECT secret_hash FROM guest_code_requests WHERE id = ? AND status = 'pending'").get(id) as
    | { secret_hash: string }
    | undefined;
  if (!row) return false;
  if (!timingSafeEqual(Buffer.from(row.secret_hash, 'hex'), Buffer.from(hashSecret(secret), 'hex'))) return false;
  return db.prepare('DELETE FROM guest_code_requests WHERE id = ?').run(id).changes > 0;
}

export type CollectResult =
  | { status: 'pending' | 'denied' | 'expired' }
  | { status: 'approved'; user: UserRow; code: string; codeId: number; platform: string | null; repeat: boolean };

/**
 * The device's poll. Undefined for an unknown id, a wrong secret, or a request collected over `RECOLLECT_MINUTES`
 * ago: all look the same from outside. An approved request is marked `collected` when first handed over, and answers
 * the same again until that window ends (`repeat: true`).
 */
export const collectGuestCodeRequest = lazyTransaction((id: number, secret: unknown): CollectResult | undefined => {
  if (typeof secret !== 'string' || secret === '') return undefined;

  const row = db.prepare('SELECT * FROM guest_code_requests WHERE id = ?').get(id) as GuestCodeRequestRow | undefined;
  if (!row) return undefined;

  const expected = Buffer.from(row.secret_hash, 'hex');
  const provided = Buffer.from(hashSecret(secret), 'hex');
  if (!timingSafeEqual(expected, provided)) return undefined;

  if (row.status === 'collected') {
    const recent = db
      .prepare(`SELECT 1 FROM guest_code_requests WHERE id = ? AND collected_at > datetime('now', '-${RECOLLECT_MINUTES} minutes')`)
      .get(id);
    if (!recent) return undefined;
  }
  if (row.status === 'denied') return { status: 'denied' };
  if (row.status === 'pending') {
    const live = db.prepare(`SELECT 1 FROM guest_code_requests WHERE id = ? AND ${PENDING}`).get(id);
    return { status: live ? 'pending' : 'expired' };
  }

  // Approved. The code or its guest may have been revoked in between.
  const code = row.code_id
    ? (db.prepare('SELECT code, used_by FROM guest_codes WHERE id = ?').get(row.code_id) as
        | { code: string; used_by: number | null }
        | undefined)
    : undefined;
  const user = code?.used_by ? findUserById(code.used_by) : undefined;
  if (!code || !user) return { status: 'expired' };

  const repeat = row.status === 'collected';
  if (!repeat) {
    db.prepare("UPDATE guest_code_requests SET status = 'collected', collected_at = datetime('now') WHERE id = ?").run(id);
  }
  return { status: 'approved', user, code: code.code, codeId: row.code_id!, platform: row.platform, repeat };
});
