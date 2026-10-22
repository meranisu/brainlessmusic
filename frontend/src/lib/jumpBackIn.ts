import { getJSON, setJSON } from './safeStorage';

/** Where a queue came from: the page it was started on. The server's saved queue has only track ids (A281). */
export type JumpSource = { kind: 'album' | 'playlist' | 'mix'; id: number };

export interface JumpEntry extends JumpSource {
  /** The song you were on. */
  trackId: number;
  /** The source's songs when it was started, so a song outside them (a radio top-up) reads as finished. */
  trackIds: number[];
  /** When it was last played, ms. */
  at: number;
}

const MAX_ENTRIES = 8;
/** A long playlist's id list is capped; past it, resuming falls back to the start. */
const MAX_IDS = 2000;

function keyFor(userId: number): string {
  return `brainlessmusic.jumpBackIn.${userId}`;
}

/** The page a queue was started from, or null for anywhere else (search, Home, a single song). */
export function sourceForPath(pathname: string): JumpSource | null {
  const match = /^\/(albums|playlists|mixes)\/(\d+)$/.exec(pathname);
  if (!match) return null;
  const kind = match[1] === 'albums' ? 'album' : match[1] === 'playlists' ? 'playlist' : 'mix';
  return { kind, id: Number(match[2]) };
}

/** Newest first, per device and per account, like the Library view. Entries left part way only. */
export function loadJumpEntries(userId: number): JumpEntry[] {
  const saved = getJSON(keyFor(userId));
  if (!Array.isArray(saved)) return [];
  return saved.filter(
    (e): e is JumpEntry =>
      e != null &&
      (e.kind === 'album' || e.kind === 'playlist' || e.kind === 'mix') &&
      typeof e.id === 'number' &&
      typeof e.trackId === 'number' &&
      Array.isArray(e.trackIds) &&
      typeof e.at === 'number',
  );
}

function same(a: JumpSource, b: JumpSource): boolean {
  return a.kind === b.kind && a.id === b.id;
}

/** Records playing [trackId] from [source]; moves it to the front. */
export function noteJump(userId: number, source: JumpSource, trackIds: number[], trackId: number): void {
  const rest = loadJumpEntries(userId).filter((e) => !same(e, source));
  const entry: JumpEntry = { ...source, trackId, trackIds: trackIds.slice(0, MAX_IDS), at: Date.now() };
  setJSON(keyFor(userId), [entry, ...rest].slice(0, MAX_ENTRIES));
}

/** The song moved on inside [source]: remember it. A song outside the source, or its last one ending, drops it. */
export function advanceJump(userId: number, source: JumpSource, trackId: number): void {
  const entries = loadJumpEntries(userId);
  const at = entries.findIndex((e) => same(e, source));
  if (at < 0) return;
  if (!entries[at].trackIds.includes(trackId)) {
    entries.splice(at, 1);
  } else {
    entries[at] = { ...entries[at], trackId, at: Date.now() };
  }
  setJSON(keyFor(userId), entries);
}

export function forgetJump(userId: number, source: JumpSource): void {
  setJSON(
    keyFor(userId),
    loadJumpEntries(userId).filter((e) => !same(e, source)),
  );
}
