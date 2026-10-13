import { db } from '../db/connection.js';
import type { SearchResults } from '../db/browse.js';
import { foldText } from '../utils/foldText.js';

/** The one result the search page shows big, with Play. */
export interface TopResult {
  kind: 'artist' | 'album' | 'track';
  id: number;
}

/**
 * The best single match: an artist, album or song named exactly what was typed (ignoring case and accents), in that
 * order; failing that the best-ranked song, then artist, then album.
 */
export function pickTopResult(query: string, results: SearchResults): TopResult | null {
  const q = foldText(query.trim());
  const artist = results.artists.find((a) => foldText(a.name) === q);
  if (artist) return { kind: 'artist', id: artist.id };
  const album = results.albums.find((a) => foldText(a.title) === q);
  if (album) return { kind: 'album', id: album.id };
  const track = results.tracks.find((t) => foldText(t.title) === q);
  if (track) return { kind: 'track', id: track.id };
  if (results.tracks[0]) return { kind: 'track', id: results.tracks[0].id };
  if (results.artists[0]) return { kind: 'artist', id: results.artists[0].id };
  if (results.albums[0]) return { kind: 'album', id: results.albums[0].id };
  return null;
}

/** Edit distance with swaps (optimal string alignment), giving up past `max`. */
export function editDistance(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  const rows: number[][] = [];
  for (let i = 0; i <= a.length; i++) {
    rows.push(new Array(b.length + 1).fill(0));
    rows[i][0] = i;
  }
  for (let j = 0; j <= b.length; j++) rows[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    let best = Infinity;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let v = Math.min(rows[i - 1][j] + 1, rows[i][j - 1] + 1, rows[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) v = Math.min(v, rows[i - 2][j - 2] + 1);
      rows[i][j] = v;
      best = Math.min(best, v);
    }
    if (best > max) return max + 1;
  }
  return rows[a.length][b.length];
}

/** How far off a query of this length may be and still get a suggestion. */
function allowedDistance(length: number): number {
  if (length < 4) return 0;
  if (length <= 5) return 1;
  if (length <= 9) return 2;
  return 3;
}

/** A name a suggestion can be, or a run of its words, as compared ("folded") and as shown. */
interface Candidate {
  text: string;
  folded: string;
}

/** Runs of words are kept up to this length; a longer query is compared with whole names only. */
const MAX_WINDOW = 4;
/** Rebuilt at least this often, and whenever the library's tracks change. */
const CACHE_MS = 10 * 60_000;

const cache = new Map<boolean, { at: number; signature: string; byWords: Map<number, Candidate[]> }>();

/** Changes when songs are added, removed, hidden, shown, go missing or come back. */
function librarySignature(): string {
  return db
    .prepare(
      `SELECT COUNT(*) || ':' || IFNULL(MAX(id), 0) || ':' || IFNULL(SUM(hidden), 0) || ':' ||
              IFNULL(SUM(missing_since IS NULL), 0) FROM tracks`,
    )
    .pluck()
    .get() as string;
}

/**
 * Every name a suggestion may be, grouped by word count: artists and albums with a song the viewer can see (so a
 * hidden artist's name is never offered, A34), and visible song titles; each whole and as runs of up to
 * [MAX_WINDOW] words. Built once and cached, since folding tens of thousands of names per search would hold up
 * every other request.
 */
function candidatesByWords(includeHidden: boolean): Map<number, Candidate[]> {
  const signature = librarySignature();
  const cached = cache.get(includeHidden);
  if (cached && cached.signature === signature && Date.now() - cached.at < CACHE_MS) return cached.byWords;

  const visible = `t.missing_since IS NULL ${includeHidden ? '' : 'AND t.hidden = 0'}`;
  const names = db
    .prepare(
      `SELECT a.name FROM artists a
       WHERE EXISTS (SELECT 1 FROM tracks t LEFT JOIN albums al ON al.id = t.album_id
                     WHERE (t.artist_id = a.id OR al.artist_id = a.id) AND ${visible})
       UNION SELECT al.title FROM albums al
       WHERE EXISTS (SELECT 1 FROM tracks t WHERE t.album_id = al.id AND ${visible})
       UNION SELECT t.title FROM tracks t WHERE ${visible}`,
    )
    .pluck()
    .all() as string[];

  const byWords = new Map<number, Map<string, string>>();
  const add = (words: number, text: string, folded: string) => {
    let bucket = byWords.get(words);
    if (!bucket) byWords.set(words, (bucket = new Map()));
    const seen = bucket.get(folded);
    if (seen === undefined || text.length < seen.length) bucket.set(folded, text);
  };
  for (const name of names) {
    const original = name?.trim().split(/\s+/).filter(Boolean) ?? [];
    if (original.length === 0) continue;
    const folded = original.map(foldText);
    add(original.length, original.join(' '), folded.join(' '));
    for (let size = 1; size <= Math.min(MAX_WINDOW, original.length - 1); size++) {
      for (let i = 0; i + size <= original.length; i++) {
        add(size, original.slice(i, i + size).join(' '), folded.slice(i, i + size).join(' '));
      }
    }
  }
  const result = new Map<number, Candidate[]>();
  for (const [words, bucket] of byWords) {
    result.set(words, [...bucket].map(([folded, text]) => ({ folded, text })));
  }
  cache.set(includeHidden, { at: Date.now(), signature, byWords: result });
  return result;
}

/**
 * "Did you mean …?" for a search that found nothing: the visible artist, album or song name closest to the query,
 * compared whole and by runs of as many words as the query has ("beatels" finds "Beatles"). Null when nothing is near.
 */
export function suggestSpelling(query: string, includeHidden = false): string | null {
  const q = foldText(query.trim()).replace(/\s+/g, ' ');
  const max = allowedDistance(q.length);
  if (max === 0) return null;
  const words = q.split(' ').length;

  let best: { text: string; distance: number } | null = null;
  for (const c of candidatesByWords(includeHidden).get(words) ?? []) {
    const d = editDistance(q, c.folded, best ? Math.min(max, best.distance) : max);
    if (d === 0 || d > max) continue;
    if (!best || d < best.distance || (d === best.distance && c.text.length < best.text.length)) {
      best = { text: c.text, distance: d };
    }
  }
  return best?.text ?? null;
}
