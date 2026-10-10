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

export function isTheme(value: string | null | undefined): value is ThemeId {
  return THEMES.some((theme) => theme.id === value);
}

/**
 * The browser's copy. The theme belongs to the profile (A55, `theme` on `/auth/me`); this copy is what `index.html`
 * paints first, so the page doesn't flash the default while the profile loads.
 */
export function loadTheme(): ThemeId {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return isTheme(stored) ? stored : DEFAULT_THEME;
  } catch {
    // Blocked site data throws on access. The default is a working app.
    return DEFAULT_THEME;
  }
}

/**
 * Whether this browser has a theme of its own. Used once per profile: a profile with no theme yet takes the browser's,
 * so a choice made before A55 isn't lost.
 */
export function hasLocalTheme(): boolean {
  try {
    return isTheme(localStorage.getItem(STORAGE_KEY));
  } catch {
    return false;
  }
}

/** Sets `data-theme` and saves the browser's copy. The default sets "blue" explicitly, so the attribute is never absent. */
export function applyTheme(theme: ThemeId): void {
  document.documentElement.dataset.theme = theme;
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    // The theme still applies for this page; it just will not be remembered.
  }
}

/**
 * Back to the default, with the browser's copy removed. Run on logout: the next person to sign in on this browser would
 * otherwise get this theme, and `syncTheme` would save it to their profile.
 */
export function clearTheme(): void {
  document.documentElement.dataset.theme = DEFAULT_THEME;
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Nothing was stored, then.
  }
}
