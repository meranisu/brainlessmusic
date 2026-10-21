import { db } from './connection.js';
import { getTrackSummariesByIds, type TrackSummary } from './browse.js';

/** Someone shown in now playing or the feed: never their login name (A174). */
export interface SocialPerson {
  id: number;
  name: string;
  avatarId: string | null;
}

export type FeedItem =
  | { kind: 'play' | 'like'; at: string; person: SocialPerson; track: TrackSummary }
  | { kind: 'playlist'; at: string; person: SocialPerson; playlist: { id: number; name: string; trackCount: number } };

/**
 * Who may appear to `viewerId`: other accounts that have not hidden their activity (A240, A241). Guests never appear.
 * Keyed by id, so callers can drop rows for anyone not in it.
 */
export function visiblePeople(viewerId: number): Map<number, SocialPerson> {
  const rows = db
    .prepare(
      `SELECT id, COALESCE(display_name, username) AS name, avatar_id AS avatarId
       FROM users WHERE kind = 'account' AND hide_activity = 0 AND id != ?`,
    )
    .all(viewerId) as SocialPerson[];
  return new Map(rows.map((row) => [row.id, row]));
}

/** Accounts someone can invite to a room (A255): every other account, hidden activity or not. Guests can't be. */
export function invitablePeople(viewerId: number): SocialPerson[] {
  return db
    .prepare(
      `SELECT id, COALESCE(display_name, username) AS name, avatar_id AS avatarId
       FROM users WHERE kind = 'account' AND id != ? ORDER BY name COLLATE NOCASE`,
    )
    .all(viewerId) as SocialPerson[];
}

export function setHideActivity(userId: number, hidden: boolean): void {
  db.prepare('UPDATE users SET hide_activity = ? WHERE id = ?').run(hidden ? 1 : 0, userId);
}

/** How far back the feed reaches, so a request never groups the whole play history. */
const FEED_WINDOW = '-30 days';

/**
 * Where a feed page ended: the last item's full sort key, so items sharing its second are neither repeated nor skipped.
 * Sent to clients as `at|kind|userId|refId`; they pass it back untouched.
 */
export interface FeedCursor {
  at: string;
  kind: FeedItem['kind'];
  userId: number;
  refId: number;
}

const KINDS: readonly FeedItem['kind'][] = ['play', 'like', 'playlist'];
const SQLITE_TIME = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/;

export function encodeFeedCursor(item: FeedItem): string {
  const refId = item.kind === 'playlist' ? item.playlist.id : item.track.id;
  return `${item.at}|${item.kind}|${item.person.id}|${refId}`;
}

/** Undefined for anything a feed page did not hand out. */
export function parseFeedCursor(text: string): FeedCursor | undefined {
  const [at, kind, userId, refId, extra] = text.split('|');
  if (extra !== undefined || !SQLITE_TIME.test(at ?? '') || !KINDS.includes(kind as FeedItem['kind'])) return undefined;
  const user = Number(userId);
  const ref = Number(refId);
  if (!Number.isInteger(user) || !Number.isInteger(ref)) return undefined;
  return { at, kind: kind as FeedItem['kind'], userId: user, refId: ref };
}

/**
 * Plays, likes and playlists going public, newest first, after `cursor` in that order. Plays are one per person per
 * song per day, so a song on repeat is one line; skips are left out. Hidden tracks never show.
 */
export function listFeed(viewerId: number, cursor: FeedCursor | null, limit: number): FeedItem[] {
  const people = visiblePeople(viewerId);
  if (people.size === 0) return [];
  const ids = [...people.keys()];
  const marks = ids.map(() => '?').join(',');
  // The inner selects only bound the scan; the row-value compare outside does the exact cut.
  const cutoff = cursor?.at ?? '9999-12-31';
  const after = cursor ?? { at: '9999-12-31', kind: 'play', userId: 0, refId: 0 };
  const rows = db
    .prepare(
      `SELECT * FROM (
         SELECT 'play' AS kind, ph.user_id AS userId, ph.track_id AS refId, MAX(ph.played_at) AS at
         FROM play_history ph JOIN tracks t ON t.id = ph.track_id AND t.hidden = 0
         WHERE ph.skipped = 0 AND ph.user_id IN (${marks})
           AND ph.played_at <= ? AND ph.played_at >= datetime('now', '${FEED_WINDOW}')
         GROUP BY ph.user_id, ph.track_id, date(ph.played_at)
         UNION ALL
         SELECT 'like', f.user_id, f.track_id, f.created_at
         FROM favorites f JOIN tracks t ON t.id = f.track_id AND t.hidden = 0
         WHERE f.user_id IN (${marks}) AND f.created_at <= ?
         UNION ALL
         SELECT 'playlist', p.owner_id, p.id, p.public_at
         FROM playlists p
         WHERE p.is_public = 1 AND p.public_at IS NOT NULL AND p.owner_id IN (${marks}) AND p.public_at <= ?
       )
       WHERE (at, kind, userId, refId) < (?, ?, ?, ?)
       ORDER BY at DESC, kind DESC, userId DESC, refId DESC
       LIMIT ?`,
    )
    .all(...ids, cutoff, ...ids, cutoff, ...ids, cutoff, after.at, after.kind, after.userId, after.refId, limit) as {
    kind: FeedItem['kind'];
    userId: number;
    refId: number;
    at: string;
  }[];

  const tracks = new Map(
    getTrackSummariesByIds(rows.filter((r) => r.kind !== 'playlist').map((r) => r.refId)).map((t) => [t.id, t]),
  );
  const playlistIds = rows.filter((r) => r.kind === 'playlist').map((r) => r.refId);
  const playlists = new Map(
    playlistIds.length === 0
      ? []
      : (
          db
            .prepare(
              `SELECT p.id, p.name, COUNT(t.id) AS trackCount
               FROM playlists p
               LEFT JOIN playlist_tracks pt ON pt.playlist_id = p.id
               LEFT JOIN tracks t ON t.id = pt.track_id AND t.hidden = 0
               WHERE p.id IN (${playlistIds.map(() => '?').join(',')})
               GROUP BY p.id`,
            )
            .all(...playlistIds) as { id: number; name: string; trackCount: number }[]
        ).map((p) => [p.id, p]),
  );

  return rows.flatMap((row): FeedItem[] => {
    const person = people.get(row.userId)!;
    if (row.kind === 'playlist') {
      const playlist = playlists.get(row.refId);
      return playlist ? [{ kind: 'playlist', at: row.at, person, playlist }] : [];
    }
    const track = tracks.get(row.refId);
    return track ? [{ kind: row.kind, at: row.at, person, track }] : [];
  });
}
