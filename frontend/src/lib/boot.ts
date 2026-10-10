const BOOT_FLAG_KEY = 'brainlessmusic.justEntered';

/**
 * Marks a fresh entry so the opening sequence plays once, not on every reload. The title screen sets it; the shell
 * reads and clears it. `sessionStorage`: router state survives Back, and `localStorage` would replay in new tabs.
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
 * Set by Exit and the account select's idle timeout, so the title screen doesn't redirect a signed-in tab into the
 * app. `sessionStorage`, and not self-clearing, so a reload on the title screen stays there.
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
