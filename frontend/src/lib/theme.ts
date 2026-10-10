/**
 * Themes are CSS variable overrides under `[data-theme]` (Tailwind 4 utilities compile to `var(--color-*)`). Scale names
 * are positional, not hues. Danger keeps its meaning: the red theme moves `--color-red-*` off its own hue.
 */

export const THEMES = [
  { id: 'blue', name: 'Deep blue', detail: 'The original' },
  { id: 'red', name: 'Crimson', detail: 'After IIDX RED' },
  { id: 'void', name: 'Void', detail: 'Near-black, accent only' },
  { id: 'nord', name: 'Nord', detail: 'Flat, after the palette' },
  { id: 'pink', name: 'Magenta', detail: 'After osu!' },
  { id: 'pastel', name: 'Pastel', detail: 'Material, soft and round' },
] as const;

export type ThemeId = (typeof THEMES)[number]['id'];

export const DEFAULT_THEME: ThemeId = 'blue';

const STORAGE_KEY = 'brainlessmusic.theme';

function isTheme(value: string | null): value is ThemeId {
  return THEMES.some((theme) => theme.id === value);
}

/** In `localStorage`: a theme belongs to the screen, and needs no round trip before first paint. */
export function loadTheme(): ThemeId {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return isTheme(stored) ? stored : DEFAULT_THEME;
  } catch {
    // Blocked site data throws on access. The default is a working app.
    return DEFAULT_THEME;
  }
}

/** Sets `data-theme` and saves it. The default sets "blue" explicitly, so the attribute is never absent. */
export function applyTheme(theme: ThemeId): void {
  document.documentElement.dataset.theme = theme;
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    // The theme still applies for this page; it just will not be remembered.
  }
}
