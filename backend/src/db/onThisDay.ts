import { db } from './connection.js';
import { getTrackSummariesByIds, type TrackSummary } from './browse.js';
import { resolveTimeZone } from './listeningStats.js';

/** Songs listed per past year; the year's Play queues these. */
export const ON_THIS_DAY_LIMIT = 20;

export interface OnThisDayYear {
  year: number;
  yearsAgo: number;
  tracks: TrackSummary[];
}

export interface OnThisDay {
  /** Today's local date as `MM-DD`. */
  date: string;
  years: OnThisDayYear[];
}

/** How far [tz]'s wall clock is ahead of UTC at [utcMs], in ms. */
function offsetAt(tz: string, utcMs: number): number {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      hourCycle: 'h23',
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      second: 'numeric',
    })
      .formatToParts(utcMs)
      .map((x) => [x.type, x.value]),
  );
  return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second) - Math.floor(utcMs / 1000) * 1000;
}

/** The UTC instant of local midnight on that date. Checked twice, since the offset can differ either side of a change. */
function localMidnight(tz: string, year: number, month: number, day: number): number {
  const wall = Date.UTC(year, month, day);
  const guess = wall - offsetAt(tz, wall);
  return wall - offsetAt(tz, guess);
}

const sqliteTime = (ms: number) => new Date(ms).toISOString().slice(0, 19).replace('T', ' ');
const isLeap = (y: number) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;

/**
 * What this user played on today's local month and day in each earlier year, most played first. Skips do not count.
 * On Feb 29, years without one use Feb 28.
 */
export function getOnThisDay(userId: number, tz: string | undefined, now = Date.now()): OnThisDay {
  const zone = resolveTimeZone(tz);
  const local = new Date(now + offsetAt(zone, now));
  const thisYear = local.getUTCFullYear();
  const month = local.getUTCMonth();
  const day = local.getUTCDate();
  const date = `${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

  const first = db
    .prepare('SELECT MIN(played_at) AS at FROM play_history WHERE user_id = ? AND skipped = 0')
    .get(userId) as { at: string | null };
  if (!first.at) return { date, years: [] };
  // A year early, so a local date ahead of UTC on New Year's Eve still finds the first year.
  const firstYear = Number(first.at.slice(0, 4)) - 1;

  const select = db.prepare(
    `SELECT track_id FROM play_history
     WHERE user_id = ? AND skipped = 0 AND played_at >= ? AND played_at < ?
     GROUP BY track_id ORDER BY COUNT(*) DESC, MIN(played_at) LIMIT ?`,
  );
  const years: OnThisDayYear[] = [];
  for (let year = thisYear - 1; year >= firstYear; year--) {
    const d = month === 1 && day === 29 && !isLeap(year) ? 28 : day;
    const start = localMidnight(zone, year, month, d);
    const end = localMidnight(zone, year, month, d + 1);
    const ids = (select.all(userId, sqliteTime(start), sqliteTime(end), ON_THIS_DAY_LIMIT) as { track_id: number }[]).map(
      (row) => row.track_id,
    );
    if (ids.length === 0) continue;
    const byId = new Map(getTrackSummariesByIds(ids).map((track) => [track.id, track]));
    const tracks = ids.flatMap((id) => byId.get(id) ?? []);
    if (tracks.length > 0) years.push({ year, yearsAgo: thisYear - year, tracks });
  }
  return { date, years };
}
