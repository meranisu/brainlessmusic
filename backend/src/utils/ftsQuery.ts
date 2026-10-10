/** FTS5 trigram query building (migration 0008). No `db/` import, so tests can use it without a database. */

/** Trigrams index 3-character runs; nothing shorter is findable. */
export const MIN_TRIGRAM_CHARS = 3;

/**
 * User input to an FTS5 MATCH, or `null` when LIKE must answer. Each term is quoted so `AND`, `*` or `(` stay literal,
 * and terms are ANDed so "beatles abbey" needn't be adjacent.
 */
export function buildMatchQuery(raw: string): string | null {
  const terms = raw.trim().split(/\s+/).filter(Boolean);
  if (terms.length === 0) return null;

  // Count code points, as the tokenizer does: two emoji are 2, not 4.
  if (terms.some((term) => [...term].length < MIN_TRIGRAM_CHARS)) return null;

  return terms.map((term) => `"${term.replace(/"/g, '""')}"`).join(' AND ');
}
