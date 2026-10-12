/**
 * Room links, `/join/KHZGBR`: what Share sends. On a phone with the app the link opens the app instead (its
 * intent filter, verified by the server's `/.well-known/assetlinks.json`); everywhere else it lands on `JoinPage`.
 * The code is kept for the tab until Listen together picks it up, so it survives a detour through sign-in.
 */

export const ROOM_CODE_LENGTH = 6;
/** The server's alphabet: no O or I, so a code read out loud can't be misheard as 0 or 1. */
export const ROOM_CODE_CHARS = /[^A-HJ-NP-Z]/g;

/** Where the Android app is downloaded: the latest GitHub release, whose APK installs and then updates itself. */
export const ANDROID_DOWNLOAD_URL = 'https://github.com/meranisu/brainlessmusic/releases/latest';

const PENDING_KEY = 'brainlessmusic.pendingRoom';

export function roomLinkFor(code: string): string {
  return `${window.location.origin}/join/${code}`;
}

/** The code in a link's path segment, or null if it can't be one. Lower case is accepted: some apps lower links. */
export function cleanRoomCode(raw: string): string | null {
  const code = raw.toUpperCase();
  return code.length === ROOM_CODE_LENGTH && code.replace(ROOM_CODE_CHARS, '') === code ? code : null;
}

// Session storage throws in some private modes; the link then only works without the sign-in detour.
export function rememberRoomLink(code: string) {
  try {
    sessionStorage.setItem(PENDING_KEY, code);
  } catch {
    /* see above */
  }
}

export function pendingRoomLink(): string | null {
  try {
    return sessionStorage.getItem(PENDING_KEY);
  } catch {
    return null;
  }
}

export function clearRoomLink() {
  try {
    sessionStorage.removeItem(PENDING_KEY);
  } catch {
    /* see above */
  }
}
