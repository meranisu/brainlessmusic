/**
 * Query building for the FTS5 trigram index (migration 0008).
 *
 * Deliberately free of any `db/` import: `db/connection.ts` opens the database
 * at import time, so anything reachable from a test file must not pull it in.
 */

/** The trigram tokenizer indexes 3-character runs — nothing shorter is findable. */
export const MIN_TRIGRAM_CHARS = 3;

/**
 * Turns raw user input into an FTS5 MATCH expression, or `null` when the
 * trigram index cannot answer it and the caller must fall back to LIKE.
 *
 * Every term is wrapped in double quotes so FTS5 reads it as a literal phrase.
 * Unquoted input would let a stray `AND`, `OR`, `NOT`, `NEAR`, `*`, `^` or `(`
 * be parsed as query syntax — which at best silently changes the results and
 * at worst throws a syntax error at someone who just typed a song title.
 *
 * Terms are ANDed rather than joined into one phrase, so "beatles abbey"
 * finds a track matching both anywhere, not only the literal adjacent string.
 */
export function buildMatchQuery(raw: string): string | null {
  const terms = raw.trim().split(/\s+/).filter(Boolean);
  if (terms.length === 0) return null;

  // Spread to count code points, not UTF-16 units — the tokenizer counts
  // characters, so a two-emoji term is 2, not 4.
  if (terms.some((term) => [...term].length < MIN_TRIGRAM_CHARS)) return null;

  return terms.map((term) => `"${term.replace(/"/g, '""')}"`).join(' AND ');
}
