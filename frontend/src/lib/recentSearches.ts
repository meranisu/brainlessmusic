/**
 * Recent searches, newest first, in this browser only and per account, so someone else signing in here doesn't see
 * them. A convenience: storage can be off or full, and then the list is simply empty.
 */
const MAX = 10;

function key(userId: number | undefined): string | null {
  return userId === undefined ? null : `brainless.recentSearches.${userId}`;
}

export function readRecentSearches(userId: number | undefined): string[] {
  const k = key(userId);
  if (!k) return [];
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(k) ?? '[]');
    return Array.isArray(parsed) ? parsed.filter((q): q is string => typeof q === 'string').slice(0, MAX) : [];
  } catch {
    return [];
  }
}

function write(userId: number | undefined, list: string[]): string[] {
  const k = key(userId);
  if (!k) return list;
  try {
    if (list.length === 0) localStorage.removeItem(k);
    else localStorage.setItem(k, JSON.stringify(list));
  } catch {
    // Storage off or full: the list just isn't kept.
  }
  return list;
}

/** Moves `query` to the front, once, ignoring case. */
export function rememberSearch(userId: number | undefined, query: string): string[] {
  const q = query.trim();
  if (!q) return readRecentSearches(userId);
  const rest = readRecentSearches(userId).filter((r) => r.toLowerCase() !== q.toLowerCase());
  return write(userId, [q, ...rest].slice(0, MAX));
}

export function forgetSearch(userId: number | undefined, query: string): string[] {
  return write(userId, readRecentSearches(userId).filter((r) => r !== query));
}

export function clearRecentSearches(userId: number | undefined): string[] {
  return write(userId, []);
}
