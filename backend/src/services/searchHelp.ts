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

/**
 * "Did you mean …?" for a search that found nothing: the artist, album or song title closest to the query, compared as
 * a whole and by runs of as many words as the query has ("beatels" finds "The Beatles"). Null when nothing is near.
 */
export function suggestSpelling(query: string, includeHidden = false): string | null {
  const q = foldText(query.trim()).replace(/\s+/g, ' ');
  const max = allowedDistance(q.length);
  if (max === 0) return null;
  const words = q.split(' ').length;

  const names = db
    .prepare(
      `SELECT name FROM artists
       UNION SELECT title FROM albums
       UNION SELECT title FROM tracks WHERE missing_since IS NULL ${includeHidden ? '' : 'AND hidden = 0'}`,
    )
    .pluck()
    .all() as string[];

  let best: { text: string; distance: number } | null = null;
  for (const name of names) {
    if (!name) continue;
    const original = name.trim().split(/\s+/);
    const folded = original.map(foldText);
    const candidates = [{ text: name.trim(), folded: folded.join(' ') }];
    if (folded.length > words) {
      for (let i = 0; i + words <= folded.length; i++) {
        candidates.push({ text: original.slice(i, i + words).join(' '), folded: folded.slice(i, i + words).join(' ') });
      }
    }
    for (const c of candidates) {
      const d = editDistance(q, c.folded, best ? Math.min(max, best.distance) : max);
      if (d === 0 || d > max) continue;
      if (!best || d < best.distance || (d === best.distance && c.text.length < best.text.length)) {
        best = { text: c.text, distance: d };
      }
    }
  }
  return best?.text ?? null;
}
