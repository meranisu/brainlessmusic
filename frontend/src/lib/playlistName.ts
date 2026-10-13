/** Longest playlist name, in characters. Matches `MAX_NAME_LENGTH` in `backend/src/routes/playlists.ts`. */
export const PLAYLIST_NAME_MAX = 100;

/** The counter shows from here, so it isn't noise on every short name. */
const COUNTER_FROM = 80;

/** Tabs, line breaks and the like, which the server turns away. */
function isControlCharacter(char: string): boolean {
  const code = char.codePointAt(0)!;
  return code < 0x20 || code === 0x7f;
}

export interface PlaylistNameCheck {
  /** The name as it will be saved. */
  trimmed: string;
  /** Characters, not UTF-16 units, the same count the server uses: an emoji is one. */
  length: number;
  /** Stops the save. A blank name is only reported once `reportBlank` is set, so an empty field isn't red on open. */
  error: string | null;
  /** Allowed, but worth knowing: another of your playlists already has this name. */
  warning: string | null;
  showCounter: boolean;
}

/**
 * Checks a playlist name the way the server does (blank, control characters, length), plus a duplicate warning the
 * server doesn't enforce: two playlists may share a name, but it's usually a slip. `ownName` is the playlist's current
 * name on a rename, so keeping it isn't flagged.
 */
export function checkPlaylistName(
  raw: string,
  takenNames: readonly string[],
  { ownName, reportBlank = false }: { ownName?: string; reportBlank?: boolean } = {},
): PlaylistNameCheck {
  const trimmed = raw.trim();
  const length = [...trimmed].length;
  const showCounter = length >= COUNTER_FROM;

  let error: string | null = null;
  if (!trimmed) {
    if (reportBlank) error = 'Give it a name first.';
  } else if ([...trimmed].some(isControlCharacter)) {
    error = "Line breaks and tabs can't go in a name.";
  } else if (length > PLAYLIST_NAME_MAX) {
    const over = length - PLAYLIST_NAME_MAX;
    error = `${over} character${over === 1 ? '' : 's'} too long. Names fit ${PLAYLIST_NAME_MAX}.`;
  }

  const key = trimmed.toLocaleLowerCase();
  const clash =
    trimmed && !error && key !== ownName?.trim().toLocaleLowerCase()
      ? takenNames.find((name) => name.trim().toLocaleLowerCase() === key)
      : undefined;
  const warning = clash ? `You already have a playlist called “${clash}”. Saving makes a second one.` : null;

  return { trimmed, length, error, warning, showCounter };
}
