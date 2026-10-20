import type { TrackListResponse } from '../types/api';
import { getItem, removeItem, setItem } from './safeStorage';

/**
 * The first library pages, kept in the browser so the list shows at once on the next visit while the real fetch runs.
 * The trip to the server through the tunnel is 0.2 to 1 s (measured 2026-10-20), far more than the server's own time.
 * Per user: hidden and liked flags differ between people. Only the opening pages, so storage stays small.
 */
export const CACHED_PAGES = 3;

const PREFIX = 'brainlessmusic.libraryPage.';

const keyOf = (userId: number, page: number) => `${PREFIX}${userId}.${page}`;

export function loadLibraryPage(userId: number | undefined, page: number): TrackListResponse | undefined {
  if (userId === undefined || page >= CACHED_PAGES) return undefined;
  const text = getItem(keyOf(userId, page));
  if (!text) return undefined;
  try {
    const data = JSON.parse(text) as TrackListResponse;
    return Array.isArray(data?.tracks) && typeof data.total === 'number' ? data : undefined;
  } catch {
    return undefined;
  }
}

export function saveLibraryPage(userId: number | undefined, page: number, data: TrackListResponse): void {
  if (userId === undefined || page >= CACHED_PAGES) return;
  setItem(keyOf(userId, page), JSON.stringify(data));
}

/** Run on logout: the next person on this browser must not see the last one's list. */
export function clearLibraryPages(): void {
  try {
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const key = localStorage.key(i);
      if (key?.startsWith(PREFIX)) removeItem(key);
    }
  } catch {
    // Storage blocked: nothing was saved, then.
  }
}
