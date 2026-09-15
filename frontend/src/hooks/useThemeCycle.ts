import { useEffect } from 'react';
import { prefersReducedMotion } from '../lib/interstitial';
import { loadTheme, THEMES } from '../lib/theme';

/** How long each theme holds before the next one fades in. */
const DWELL_MS = 20_000;

/**
 * Cycles `data-theme` through every entry in `THEMES` while mounted — the
 * attract screen and login page showing off the whole palette instead of
 * committing to whichever one was last picked in Options.
 *
 * Sets `data-theme-cycling` alongside `data-theme`, which is what the
 * `transition` in index.css is scoped to — a manual pick in Options never
 * carries this attribute, so it stays instant exactly as it does today. The
 * cycle itself never calls `applyTheme()` and never touches `localStorage`:
 * it is a decoration for a screen nobody has signed in on yet, not a change
 * to anyone's saved preference. On unmount it restores the persisted theme
 * directly, so signing in always lands on what Options actually says.
 *
 * Skipped entirely under reduced motion, the same way `lib/interstitial.ts`
 * skips its own animations — a still screen showing the saved theme, not a
 * slowed-down cycle.
 */
export function useThemeCycle(): void {
  useEffect(() => {
    if (prefersReducedMotion()) return;

    const root = document.documentElement;
    let index = THEMES.findIndex((theme) => theme.id === root.dataset.theme);
    if (index < 0) index = 0;

    root.dataset.themeCycling = 'true';

    const id = setInterval(() => {
      index = (index + 1) % THEMES.length;
      root.dataset.theme = THEMES[index].id;
    }, DWELL_MS);

    return () => {
      clearInterval(id);
      delete root.dataset.themeCycling;
      root.dataset.theme = loadTheme();
    };
  }, []);
}
