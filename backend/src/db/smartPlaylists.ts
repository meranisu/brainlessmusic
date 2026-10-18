import { db } from './connection.js';
import { trackGainSql } from './loudness.js';
import { foldText } from '../utils/foldText.js';
import type { PlaylistTrack } from './playlists.js';
import { likePattern } from '../utils/like.js';

/**
 * Smart playlists (A207): rules saved on a playlist, run against the owner's own plays and likes (A208) each time it
 * opens. Rules arrive as client JSON, so `checkRules` rebuilds them from a whitelist and the SQL for each field and op
 * is fixed here; client values only ever go in as bound parameters.
 */

export type SmartMatch = 'all' | 'any';
export type SmartSort = 'random' | 'lastPlayedAsc' | 'myPlaysDesc' | 'myPlaysAsc' | 'dateAddedDesc' | 'title';

export type SmartRule =
  | { field: 'myPlays'; op: 'lt' | 'gt' | 'eq'; value: number }
  | { field: 'lastPlayed'; op: 'olderThanDays' | 'withinDays'; value: number }
  | { field: 'lastPlayed'; op: 'never' }
  | { field: 'dateAdded'; op: 'olderThanDays' | 'withinDays'; value: number }
  | { field: 'liked' | 'disliked'; op: 'is'; value: boolean }
  | { field: 'genre'; op: 'is' | 'isNot'; value: string }
  | { field: 'artist'; op: 'is' | 'contains'; value: string }
  | { field: 'year'; op: 'lt' | 'gt' | 'eq'; value: number }
  | { field: 'duration'; op: 'lt' | 'gt'; value: number };

export interface SmartRules {
  v: 1;
  match: SmartMatch;
  rules: SmartRule[];
  sort: SmartSort;
  limit: number;
}

export const MAX_SMART_RULES = 10;
export const MAX_SMART_LIMIT = 500;
export const DEFAULT_SMART_LIMIT = 100;

const SORTS: readonly SmartSort[] = ['random', 'lastPlayedAsc', 'myPlaysDesc', 'myPlaysAsc', 'dateAddedDesc', 'title'];

type Checked = { rules: SmartRules } | { error: string };

function isRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null && !Array.isArray(x);
}

function isWhole(x: unknown, min: number, max: number): x is number {
  return typeof x === 'number' && Number.isInteger(x) && x >= min && x <= max;
}

function checkRule(raw: unknown): SmartRule | string {
  if (!isRecord(raw)) return 'Each rule needs a field and an op';
  const { field, op, value } = raw;
  switch (field) {
    case 'myPlays':
    case 'year':
      if (op !== 'lt' && op !== 'gt' && op !== 'eq') return `"${String(field)}" takes lt, gt or eq`;
      if (!isWhole(value, 0, field === 'year' ? 3000 : 100000)) return `"${String(field)}" needs a whole number`;
      return { field, op, value };
    case 'lastPlayed':
      if (op === 'never') return { field, op };
      if (op !== 'olderThanDays' && op !== 'withinDays') return '"lastPlayed" takes olderThanDays, withinDays or never';
      if (!isWhole(value, 0, 36500)) return 'Days must be a whole number up to 36500';
      return { field, op, value };
    case 'dateAdded':
      if (op !== 'olderThanDays' && op !== 'withinDays') return '"dateAdded" takes olderThanDays or withinDays';
      if (!isWhole(value, 0, 36500)) return 'Days must be a whole number up to 36500';
      return { field, op, value };
    case 'liked':
    case 'disliked':
      if (op !== 'is') return `"${String(field)}" takes is`;
      if (typeof value !== 'boolean') return `"${String(field)}" needs true or false`;
      return { field, op, value };
    case 'genre':
    case 'artist': {
      const allowed = field === 'genre' ? ['is', 'isNot'] : ['is', 'contains'];
      if (typeof op !== 'string' || !allowed.includes(op)) return `"${field}" takes ${allowed.join(' or ')}`;
      if (typeof value !== 'string' || value.trim() === '' || value.length > 100) return `"${field}" needs a name up to 100 characters`;
      return { field, op, value: value.trim() } as SmartRule;
    }
    case 'duration':
      if (op !== 'lt' && op !== 'gt') return '"duration" takes lt or gt';
      if (!isWhole(value, 0, 86400)) return 'Duration is whole seconds up to 86400';
      return { field, op, value };
    default:
      return `Unknown rule field "${String(field)}"`;
  }
}

/** Rebuilds client JSON into rules we trust, or says what is wrong in words fit to show. */
export function checkRules(input: unknown): Checked {
  if (!isRecord(input)) return { error: 'Rules must be an object' };
  const match = input.match ?? 'all';
  if (match !== 'all' && match !== 'any') return { error: '"match" must be all or any' };
  const sort = input.sort ?? 'random';
  if (typeof sort !== 'string' || !SORTS.includes(sort as SmartSort)) return { error: 'Unknown sort' };
  const limit = input.limit ?? DEFAULT_SMART_LIMIT;
  if (!isWhole(limit, 1, MAX_SMART_LIMIT)) return { error: `Limit must be a whole number from 1 to ${MAX_SMART_LIMIT}` };
  if (!Array.isArray(input.rules) || input.rules.length === 0) return { error: 'Add at least one rule' };
  if (input.rules.length > MAX_SMART_RULES) return { error: `At most ${MAX_SMART_RULES} rules` };

  const rules: SmartRule[] = [];
  for (const raw of input.rules) {
    const checked = checkRule(raw);
    if (typeof checked === 'string') return { error: checked };
    rules.push(checked);
  }
  return { rules: { v: 1, match, rules, sort: sort as SmartSort, limit } };
}

/** Reads a stored column back; null for an ordinary playlist or a value that no longer validates. */
export function parseStoredRules(stored: string | null): SmartRules | null {
  if (stored === null) return null;
  try {
    const checked = checkRules(JSON.parse(stored));
    return 'rules' in checked ? checked.rules : null;
  } catch {
    return null;
  }
}

const CMP = { lt: '<', gt: '>', eq: '=' } as const;

/** One rule as a WHERE fragment; its values are pushed onto `params` in the order its `?` appear. */
function ruleSql(rule: SmartRule, userId: number, params: unknown[]): string {
  switch (rule.field) {
    case 'myPlays':
      params.push(rule.value);
      return `COALESCE(mp.plays, 0) ${CMP[rule.op]} ?`;
    case 'lastPlayed':
      if (rule.op === 'never') return 'mp.last IS NULL';
      params.push(`-${rule.value} days`);
      // Never played counts as "not played in N days", which is what that rule is for.
      return rule.op === 'olderThanDays'
        ? `(mp.last IS NULL OR datetime(mp.last) < datetime('now', ?))`
        : `(mp.last IS NOT NULL AND datetime(mp.last) >= datetime('now', ?))`;
    case 'dateAdded':
      params.push(`-${rule.value} days`);
      return rule.op === 'olderThanDays'
        ? `datetime(t.date_added) < datetime('now', ?)`
        : `datetime(t.date_added) >= datetime('now', ?)`;
    case 'liked':
    case 'disliked': {
      const table = rule.field === 'liked' ? 'favorites' : 'less_often';
      params.push(userId);
      return `${rule.value ? '' : 'NOT '}EXISTS (SELECT 1 FROM ${table} x WHERE x.user_id = ? AND x.track_id = t.id)`;
    }
    case 'genre':
      params.push(rule.value);
      return `${rule.op === 'is' ? '' : 'NOT '}EXISTS (SELECT 1 FROM track_genres tg JOIN genres g ON g.id = tg.genre_id
        WHERE tg.track_id = t.id AND g.name = ?)`;
    case 'artist':
      if (rule.op === 'is') {
        params.push(rule.value);
        return 'a.name = ? COLLATE NOCASE';
      }
      // `%` and `_` in the text are literal, and accents don't matter, as in playlist search.
      params.push(likePattern(foldText(rule.value)));
      return `fold(a.name) LIKE ? ESCAPE '\\'`;
    case 'year':
      params.push(rule.value);
      return `al.year ${CMP[rule.op]} ?`;
    case 'duration':
      params.push(rule.value);
      return `t.duration ${CMP[rule.op]} ?`;
  }
}

/** Days since the epoch (UTC). The seed of a "Random" order, so it holds for a day and then changes. */
function dayNumber(): number {
  return Math.floor(Date.now() / 86_400_000);
}

/**
 * What a "Random" order is shuffled by. One playlist keeps its order through the day, so opening it twice, renaming
 * it or downloading it doesn't reshuffle, and a limit that cuts the list keeps the same songs. Tomorrow it is
 * different. Playlists get different orders from each other, and a preview (no playlist yet) uses the day alone.
 */
export function smartSeed(playlistId = 0): number {
  return dayNumber() + playlistId * 7919;
}

/** Orders by `(id + seed) * 2654435761 mod 2^32` (Fibonacci hashing): spread evenly, so songs added together part ways. */
function randomOrder(seed: number): string {
  const salt = Number.isSafeInteger(seed) ? Math.abs(seed) % 1_000_003 : 0;
  return `(((t.id + ${salt}) * 2654435761) % 4294967296), t.id`;
}

function orderSql(sort: SmartSort, seed: number): string {
  switch (sort) {
    case 'random':
      return randomOrder(seed);
    // Never played first, then longest ago.
    case 'lastPlayedAsc':
      return 'mp.last IS NOT NULL, datetime(mp.last) ASC, t.id';
    case 'myPlaysDesc':
      return 'COALESCE(mp.plays, 0) DESC, t.id';
    case 'myPlaysAsc':
      return 'COALESCE(mp.plays, 0) ASC, t.id';
    case 'dateAddedDesc':
      return 't.date_added DESC, t.id DESC';
    case 'title':
      return 't.title COLLATE NOCASE, t.id';
  }
}

/**
 * The FROM and WHERE of a smart playlist for `userId`, and the values for its `?`s in order. Plays are theirs alone
 * (A208, skips left out as in listening stats). Hidden and missing tracks never appear, and nor do disliked ones
 * unless a rule asks about `disliked` (A211).
 */
function matchingTracks(rules: SmartRules, userId: number): { from: string; params: unknown[] } {
  const params: unknown[] = [userId];
  const where: string[] = ['t.hidden = 0', 't.missing_since IS NULL'];

  if (!rules.rules.some((r) => r.field === 'disliked')) {
    where.push('NOT EXISTS (SELECT 1 FROM less_often lo WHERE lo.user_id = ? AND lo.track_id = t.id)');
    params.push(userId);
  }
  const parts = rules.rules.map((r) => ruleSql(r, userId, params));
  where.push(`(${parts.join(rules.match === 'all' ? ' AND ' : ' OR ')})`);

  const from = `FROM tracks t
       LEFT JOIN artists a ON a.id = t.artist_id
       LEFT JOIN albums al ON al.id = t.album_id
       LEFT JOIN (
         SELECT track_id, COUNT(*) AS plays, MAX(played_at) AS last
         FROM play_history WHERE user_id = ? AND skipped = 0 GROUP BY track_id
       ) mp ON mp.track_id = t.id
       WHERE ${where.join(' AND ')}`;
  return { from, params };
}

/** The songs these rules pick for `userId`. `seed` fixes a "Random" order; see `smartSeed`. */
export function evaluateRules(rules: SmartRules, userId: number, seed = smartSeed()): PlaylistTrack[] {
  const { from, params } = matchingTracks(rules, userId);
  const rows = db
    .prepare(
      `SELECT
         t.id as id,
         t.title as title,
         a.name as artist,
         al.title as album,
         t.album_id as albumId,
         t.track_number as trackNumber,
         t.duration as duration,
         ${trackGainSql()} as gainDb,
         t.format as format,
         t.date_added as addedAt
       ${from}
       ORDER BY ${orderSql(rules.sort, seed)}
       LIMIT ?`,
    )
    .all(...params, rules.limit) as Omit<PlaylistTrack, 'position'>[];
  return rows.map((row, position) => ({ ...row, position }));
}

export interface SmartSummary {
  trackCount: number;
  /** Up to four different albums, for a cover mosaic. */
  coverAlbumIds: number[];
}

// A list of playlists, a search and "Add to playlist" each need every smart playlist's count and cover, and running
// the rules takes about 0.2 s at 50k songs. So the answer is kept: dropped at once when the user's own plays, likes
// or dislikes change (`clearSmartSummaries`), and after a few minutes whatever else (a scan, a hidden song) changed.
const SUMMARY_TTL_MS = 5 * 60_000;
const SUMMARY_MAX_ENTRIES = 500;
const summaries = new Map<string, { at: number; summary: SmartSummary }>();

/** How many songs the rules pick and their covers, without building the rows. Sorted by title so a cover is steady. */
export function summarizeRules(rules: SmartRules, userId: number): SmartSummary {
  const byTitle: SmartRules = { ...rules, sort: 'title' };
  const key = `${userId}|${JSON.stringify(byTitle)}`;
  const hit = summaries.get(key);
  if (hit && Date.now() - hit.at < SUMMARY_TTL_MS) return hit.summary;

  const { from, params } = matchingTracks(byTitle, userId);
  const rows = db
    .prepare(`SELECT t.album_id AS albumId ${from} ORDER BY ${orderSql('title', 0)} LIMIT ?`)
    .all(...params, rules.limit) as { albumId: number | null }[];
  const coverAlbumIds: number[] = [];
  for (const { albumId } of rows) {
    if (albumId !== null && !coverAlbumIds.includes(albumId)) coverAlbumIds.push(albumId);
    if (coverAlbumIds.length === 4) break;
  }
  const summary = { trackCount: rows.length, coverAlbumIds };
  if (summaries.size >= SUMMARY_MAX_ENTRIES) summaries.clear();
  summaries.set(key, { at: Date.now(), summary });
  return summary;
}

/** Forget every kept summary. For tests, which empty the database under a running process. */
export function clearAllSmartSummaries(): void {
  summaries.clear();
}

/** Forget this user's kept summaries: their plays, likes or dislikes just changed what their rules pick. */
export function clearSmartSummaries(userId: number): void {
  const prefix = `${userId}|`;
  for (const key of summaries.keys()) if (key.startsWith(prefix)) summaries.delete(key);
}
