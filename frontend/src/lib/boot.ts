const BOOT_FLAG_KEY = 'brainlessmusic.justEntered';

/**
 * The app's opening sequence is a one-shot, and this is the shot.
 *
 * `AppShell` mounts on every reload and stays mounted across route changes, so
 * "animate on mount" would replay a 1.2-second assembly every time the tab is
 * refreshed. The title screen sets this immediately before navigating; the
 * shell reads it once and clears it.
 *
 * `sessionStorage` rather than router state, which is lost on a reload but
 * *kept* when the user navigates back — exactly backwards from what is wanted
 * here. And rather than `localStorage`, which would replay the boot in a brand
 * new tab that never saw the title screen.
 */
export function markJustEntered(): void {
  try {
    sessionStorage.setItem(BOOT_FLAG_KEY, '1');
  } catch {
    // Blocked site data throws on access. The app is identical without the
    // animation, so there is nothing to recover from.
  }
}

/** True once, for the mount that follows an entry. Clears itself. */
export function consumeJustEntered(): boolean {
  try {
    if (sessionStorage.getItem(BOOT_FLAG_KEY) === null) return false;
    sessionStorage.removeItem(BOOT_FLAG_KEY);
    return true;
  } catch {
    return false;
  }
}

const TITLE_HOLD_KEY = 'brainlessmusic.atTitle';

/**
 * Set by the header's Exit, and read by the title screen's redirect.
 *
 * That redirect exists so a signed-in tab cannot land on the attract screen by
 * accident — which makes deliberately going there the one case it gets wrong.
 * This is how the title screen tells the two apart.
 *
 * Exit is emphatically **not** a log out. A guest has no password to come back
 * with, so dropping the token would not be an exit, it would be a deletion: the
 * row, its favorites, its playlists and its history, gone with no way to ask
 * for them back. Exit leaves the token exactly where it was and changes nothing
 * but which screen is showing.
 *
 * `sessionStorage` for the same reason `justEntered` uses it — a new tab should
 * open into the app, not onto a title screen it never asked for — but unlike
 * that flag this one is not self-clearing, because a reload while standing on
 * the title screen should leave you standing on the title screen.
 */
export function markAtTitle(): void {
  try {
    sessionStorage.setItem(TITLE_HOLD_KEY, '1');
  } catch {
    // Blocked site data. The title screen will bounce back to the app, which is
    // the pre-Exit behaviour rather than a broken one.
  }
}

/** Whether this tab was sent to the title screen on purpose. Does not clear. */
export function isAtTitle(): boolean {
  try {
    return sessionStorage.getItem(TITLE_HOLD_KEY) !== null;
  } catch {
    return false;
  }
}

/** Cleared on the way back in, so the next reload lands in the app. */
export function clearAtTitle(): void {
  try {
    sessionStorage.removeItem(TITLE_HOLD_KEY);
  } catch {
    // See above.
  }
}
