/**
 * Text as search compares it: accents and other marks dropped, lower case. "Beyoncé" and "beyonce" fold alike, as
 * the library's search index already treats them (`remove_diacritics`, migration 0008). The connection registers it
 * as the SQL function `fold()` for the searches that use LIKE (people, playlists).
 */
export function foldText(text: string): string {
  return text.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase();
}
