import { db } from './connection.js';

export type LetterScope = 'tracks' | 'albums' | 'artists';

export interface LetterEntry {
  /** `#` (digits, punctuation, anything that sorts before "a"), `A`–`Z`, or `…` (whatever sorts after "z": accents, CJK, kana). */
  letter: string;
  /** Position of this bucket's first row in the scope's default listing — what a client jumps to. For an empty bucket, where its first row would be. */
  offset: number;
  count: number;
}

export interface LetterIndex {
  total: number;
  letters: LetterEntry[];
}

/**
 * Where each letter starts in the list a client would otherwise page through.
 *
 * The lists sort by `COLLATE NOCASE`, which folds only ASCII case, so the order is: everything
 * below "a" (digits, quotes, most punctuation), then a–z, then everything above "z" (`{|}~`, and
 * every non-ASCII character). The buckets are cut on exactly those boundaries rather than on
 * "first letter of the title", because a bucket has to be a contiguous run of the sorted list or
 * a jump lands somewhere else. That is why Japanese titles sit under `…` after Z here, and why
 * they would be wrong under `#` (where the web rail puts them).
 *
 * The filters mirror what `GET /tracks`, `/albums` and `/artists` show by default — a count that
 * disagreed with the list would jump to the wrong row.
 */
const SOURCES: Record<LetterScope, { from: string; where: string; column: string }> = {
  tracks: { from: 'tracks t', where: 't.missing_since IS NULL AND t.hidden = 0', column: 't.title' },
  albums: {
    from: 'albums al',
    where: 'EXISTS (SELECT 1 FROM tracks t WHERE t.album_id = al.id AND t.missing_since IS NULL)',
    column: 'al.title',
  },
  artists: {
    from: 'artists a',
    where: 'EXISTS (SELECT 1 FROM tracks t WHERE t.artist_id = a.id AND t.missing_since IS NULL)',
    column: 'a.name',
  },
};

/** a..z, then "{" — the first character above "z". */
const BOUNDARIES = [...'abcdefghijklmnopqrstuvwxyz', '{'];
const LETTERS = ['#', ...'ABCDEFGHIJKLMNOPQRSTUVWXYZ', '…'];

export function getLetterIndex(scope: LetterScope): LetterIndex {
  const { from, where, column } = SOURCES[scope];
  // One scan: how many rows sort below each boundary.
  const sums = BOUNDARIES.map((b, i) => `COALESCE(SUM(${column} COLLATE NOCASE < '${b}'), 0) AS b${i}`).join(', ');
  const row = db.prepare(`SELECT COUNT(*) AS total, ${sums} FROM ${from} WHERE ${where}`).get() as Record<string, number>;

  const total = row.total;
  // below[i] = rows sorting before LETTERS[i]'s first row; the last bucket runs to the end.
  const starts = [0, ...BOUNDARIES.map((_, i) => row[`b${i}`])];
  const letters = LETTERS.map((letter, i) => {
    const end = i + 1 < starts.length ? starts[i + 1] : total;
    return { letter, offset: starts[i], count: end - starts[i] };
  });
  return { total, letters };
}
