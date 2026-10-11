import { lazy, type ComponentType } from 'react';

const RELOAD_KEY = 'brainlessmusic.chunkReloadAt';

/** A second failure inside this window is a real outage, not a stale page; reloading again would loop. */
const RELOAD_WINDOW_MS = 10_000;

function reloadedJustNow(): boolean {
  try {
    const at = Number(sessionStorage.getItem(RELOAD_KEY));
    return Number.isFinite(at) && Date.now() - at < RELOAD_WINDOW_MS;
  } catch {
    // Blocked site data: no way to tell, so don't risk a reload loop.
    return true;
  }
}

/**
 * `React.lazy` that survives a deploy. A tab opened before a deploy still names the old hashed chunks, which are gone
 * from the server, so the import fails and React unmounts to a blank page. One reload fetches the new index.html and
 * the new chunk names, landing on the same address.
 */
export function lazyPage<T extends ComponentType>(load: () => Promise<{ default: T }>) {
  return lazy(async () => {
    try {
      return await load();
    } catch (error) {
      if (reloadedJustNow()) throw error;
      try {
        sessionStorage.setItem(RELOAD_KEY, String(Date.now()));
      } catch {
        // Unreachable in practice: reloadedJustNow() returned true for blocked storage.
      }
      window.location.reload();
      // Never settles, so nothing renders an error in the moment before the reload.
      return new Promise<never>(() => {});
    }
  });
}
