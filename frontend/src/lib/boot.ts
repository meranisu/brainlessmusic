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
