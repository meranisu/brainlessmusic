import { db } from './connection.js';

export type LetterScope = 'tracks' | 'albums' | 'artists';

export interface LetterEntry {
  /**
   * `#` (digits, punctuation, anything that sorts before "a"), `A`–`Z`, then one entry per script the listing has
   * (`À` accented Latin, `Ω` Greek, `Я` Cyrillic, `あ` hiragana, `ア` katakana, `漢` CJK, `한` Hangul) and `…` for any
   * other run above "z". `#` and A–Z are always present; the entries after Z only when non-empty.
   */
  letter: string;
  /** Index of the bucket's first row in the default listing (where it would be, if empty). */
  offset: number;
  count: number;
}

export interface LetterIndex {
  total: number;
  letters: LetterEntry[];
}

/**
 * Where each letter starts in a listing. `COLLATE NOCASE` folds only ASCII, so buckets follow the sort: below "a",
 * a–z, then non-ASCII by code point, one bucket per script (so Japanese sits after Z). Filters must match the default
 * listings.
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

/**
 * Where each bucket after "#" starts, in sort order. Above "z" the sort is by code point, so each script is one
 * unbroken run starting at its block's first code point; the gaps between them are `…`, which can appear more than
 * once (symbols after "z", and, say, Thai between Cyrillic and kana).
 */
const BUCKETS: { letter: string; from: string }[] = [
  ...[...'abcdefghijklmnopqrstuvwxyz'].map((c) => ({ letter: c.toUpperCase(), from: c })),
  { letter: '…', from: '{' },
  { letter: 'À', from: '\u00C0' }, // Latin-1 Supplement letters and Latin Extended-A/B
  { letter: '…', from: '\u0250' },
  { letter: 'Ω', from: '\u0370' }, // Greek
  { letter: 'Я', from: '\u0400' }, // Cyrillic
  { letter: '…', from: '\u0530' },
  { letter: 'あ', from: '\u3040' }, // Hiragana
  { letter: 'ア', from: '\u30A0' }, // Katakana
  { letter: '…', from: '\u3100' },
  { letter: '漢', from: '\u4E00' }, // CJK Unified Ideographs
  { letter: '…', from: '\uA000' },
  { letter: '한', from: '\uAC00' }, // Hangul syllables
  { letter: '…', from: '\uD7B0' },
];
/** The first bucket that is dropped when empty: everything after Z. */
const FIRST_OPTIONAL = 27;

export interface LetterOptions {
  /**
   * Tracks only. `all` keeps songs whose files are missing, which is what the web library list shows (A213), so its
   * letters land on the right row. The default leaves them out, as Android's list does.
   */
  missing?: 'exclude' | 'all';
}

export function getLetterIndex(scope: LetterScope, options: LetterOptions = {}): LetterIndex {
  const { from, column } = SOURCES[scope];
  const where = scope === 'tracks' && options.missing === 'all' ? 't.hidden = 0' : SOURCES[scope].where;
  // One scan: how many rows sort below each bucket's start. NOCASE then a byte compare keeps code point order.
  const sums = BUCKETS.map((_, i) => `COALESCE(SUM(${column} COLLATE NOCASE < ?), 0) AS b${i}`).join(', ');
  const row = db
    .prepare(`SELECT COUNT(*) AS total, ${sums} FROM ${from} WHERE ${where}`)
    .get(...BUCKETS.map((b) => b.from)) as Record<string, number>;

  const total = row.total;
  // starts[i] = rows sorting before entry i's first row; the last bucket runs to the end.
  const labels = ['#', ...BUCKETS.map((b) => b.letter)];
  const starts = [0, ...BUCKETS.map((_, i) => row[`b${i}`])];
  const letters = labels
    .map((letter, i) => {
      const end = i + 1 < starts.length ? starts[i + 1] : total;
      return { letter, offset: starts[i], count: end - starts[i] };
    })
    .filter((entry, i) => i < FIRST_OPTIONAL || entry.count > 0);
  return { total, letters };
}
