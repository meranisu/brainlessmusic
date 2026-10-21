import { db } from './connection.js';

export type RoomIssueSource = 'android' | 'web' | 'server';

/** What went wrong. A fixed list so a client can't fill the column with free text. */
export const ROOM_ISSUE_KINDS = [
  'parse-failed',
  'socket-failed',
  'socket-closed',
  'server-error',
  'server-closed',
  'request-failed',
] as const;
export type RoomIssueKind = (typeof ROOM_ISSUE_KINDS)[number];

export interface RoomIssueInput {
  userId: number;
  source: RoomIssueSource;
  kind: RoomIssueKind;
  message: string;
  roomCode?: string;
  detail?: string;
  httpStatus?: number;
  appVersion?: string;
  userAgent?: string;
}

export interface RoomIssueEntry {
  id: number;
  userId: number;
  username: string;
  source: RoomIssueSource;
  kind: RoomIssueKind;
  roomCode: string | null;
  message: string;
  detail: string | null;
  httpStatus: number | null;
  appVersion: string | null;
  userAgent: string | null;
  createdAt: string;
}

/** Rows kept. Any signed-in user can report, so the table must not grow with them (same cap as playback failures). */
export const ROOM_ISSUES_KEPT = 1000;

/** Longest stored text per field. `detail` holds a stack line or a cut of the message that failed to parse. */
const MAX_MESSAGE_LENGTH = 500;
const MAX_DETAIL_LENGTH = 1000;
const MAX_SHORT_FIELD_LENGTH = 200;

function clip(value: string | undefined, max: number): string | null {
  return value === undefined ? null : value.slice(0, max);
}

/** Records one issue and drops the oldest rows past `ROOM_ISSUES_KEPT`. */
export function recordRoomIssue(input: RoomIssueInput): void {
  db.prepare(
    `INSERT INTO room_issues
       (user_id, source, kind, room_code, message, detail, http_status, app_version, user_agent)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    input.userId,
    input.source,
    input.kind,
    clip(input.roomCode, MAX_SHORT_FIELD_LENGTH),
    clip(input.message, MAX_MESSAGE_LENGTH),
    clip(input.detail, MAX_DETAIL_LENGTH),
    input.httpStatus ?? null,
    clip(input.appVersion, MAX_SHORT_FIELD_LENGTH),
    clip(input.userAgent, MAX_SHORT_FIELD_LENGTH),
  );

  db.prepare(
    `DELETE FROM room_issues
     WHERE id NOT IN (SELECT id FROM room_issues ORDER BY id DESC LIMIT ?)`,
  ).run(ROOM_ISSUES_KEPT);
}

const DEFAULT_LIMIT = 100;

/** Rows stored, for paging (at most `ROOM_ISSUES_KEPT`). */
export function countRoomIssues(): number {
  return (db.prepare('SELECT COUNT(*) AS n FROM room_issues').get() as { n: number }).n;
}

/** Newest first; `offset` skips that many of the newest. */
export function listRecentRoomIssues(limit = DEFAULT_LIMIT, offset = 0): RoomIssueEntry[] {
  return db
    .prepare(
      `SELECT
         ri.id AS id,
         ri.user_id AS userId,
         u.username AS username,
         ri.source AS source,
         ri.kind AS kind,
         ri.room_code AS roomCode,
         ri.message AS message,
         ri.detail AS detail,
         ri.http_status AS httpStatus,
         ri.app_version AS appVersion,
         ri.user_agent AS userAgent,
         ri.created_at AS createdAt
       FROM room_issues ri
       JOIN users u ON u.id = ri.user_id
       ORDER BY ri.id DESC
       LIMIT ? OFFSET ?`,
    )
    .all(limit, offset) as RoomIssueEntry[];
}
