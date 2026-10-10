import { useEffect, useState } from 'react';
import { prefersReducedMotion } from '../lib/interstitial';
import { loadTheme, THEMES, type ThemeId } from '../lib/theme';

/** How long each theme holds before the next one fades in. */
const DWELL_MS = 20_000;

/**
 * Cycles `data-theme` through `THEMES` on the title and login screens without saving anything, then restores the
 * saved theme on unmount. Skipped under reduced motion. Returns the theme on screen, for the title HUD.
 */
export function useThemeCycle(): ThemeId {
  const [current, setCurrent] = useState<ThemeId>(
    () => THEMES.find((theme) => theme.id === document.documentElement.dataset.theme)?.id ?? loadTheme(),
  );

  useEffect(() => {
    if (prefersReducedMotion()) return;

    const root = document.documentElement;
    let index = THEMES.findIndex((theme) => theme.id === root.dataset.theme);
    if (index < 0) index = 0;

    root.dataset.themeCycling = 'true';

    const id = setInterval(() => {
      index = (index + 1) % THEMES.length;
      root.dataset.theme = THEMES[index].id;
      setCurrent(THEMES[index].id);
    }, DWELL_MS);

    return () => {
      clearInterval(id);
      delete root.dataset.themeCycling;
      root.dataset.theme = loadTheme();
    };
  }, []);

  return current;
}
