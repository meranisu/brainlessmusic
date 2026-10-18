import { useQuery } from '@tanstack/react-query';
import type { LetterEntry, LetterIndex } from '../types/api';
import { apiClient } from './apiClient';

/** The rail's letters, in list order. The server also sends buckets for other scripts after Z; the rail leaves them out. */
export const RAIL_LETTERS = ['#', ...Array.from({ length: 26 }, (_, i) => String.fromCharCode(65 + i))];
const RAIL_SET = new Set(RAIL_LETTERS);

/**
 * Where each letter starts in the library list, from the server, so the rail can jump to a letter whose songs have not
 * loaded. `missing=all` because the list shows songs whose files are missing (A213), and the offsets must match it.
 * Under the `['tracks']` key, so a scan that ends refreshes it with the list.
 */
export function useLetterIndex() {
  return useQuery({
    queryKey: ['tracks', 'letters'],
    queryFn: () => apiClient.get<LetterIndex>('/browse/letters?scope=tracks&missing=all'),
    staleTime: 60_000,
  });
}

/** The rail letter whose run holds row `index`; null past Z (another script) or in an empty list. */
export function letterAtIndex(letters: LetterEntry[], index: number): string | null {
  for (const entry of letters) {
    if (RAIL_SET.has(entry.letter) && entry.count > 0 && index >= entry.offset && index < entry.offset + entry.count) {
      return entry.letter;
    }
  }
  return null;
}

/** The entry for a rail letter, or undefined if the server did not send it. */
export function letterEntry(letters: LetterEntry[], letter: string): LetterEntry | undefined {
  return letters.find((entry) => entry.letter === letter);
}
