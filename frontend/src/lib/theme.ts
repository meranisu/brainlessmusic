/**
 * Themes.
 *
 * The whole system rests on one property of Tailwind 4: a utility like
 * `bg-blue-900` does not compile to a colour, it compiles to
 * `background-color: var(--color-blue-900)`. So redefining those variables
 * under a `[data-theme]` selector repaints every component in the app without
 * touching a single one of them. The planning doc budgeted this phase for a
 * mechanical lift of hard-coded classes into tokens; that turned out to be
 * unnecessary, and not doing it is worth more than doing it well would have
 * been — a diff across twenty-five components is twenty-five chances to change
 * something that was not a colour.
 *
 * The consequence to be honest about: **the scale names stop describing hues.**
 * In the red theme `--color-blue-900` is a dark wine. The names are now
 * positional — `blue-950` means "the deepest ground", `blue-300` means "muted
 * text", `orange-600` means "the accent" — and the alternative was renaming
 * every class in the app, which is exactly the sweep this approach avoids.
 *
 * Danger and success keep their own meaning across themes. `--color-red-*` is
 * overridden in the red theme rather than left alone, because a destructive
 * button in the theme's own hue is indistinguishable from an ordinary one.
 */

export const THEMES = [
  { id: 'blue', name: 'Deep blue', detail: 'The original' },
  { id: 'red', name: 'Crimson', detail: 'After IIDX RED' },
  { id: 'void', name: 'Void', detail: 'Near-black, accent only' },
] as const;

export type ThemeId = (typeof THEMES)[number]['id'];

export const DEFAULT_THEME: ThemeId = 'blue';

const STORAGE_KEY = 'brainlessmusic.theme';

function isTheme(value: string | null): value is ThemeId {
  return THEMES.some((theme) => theme.id === value);
}

/**
 * `localStorage`, not the server, per the decision in the questions ledger: a
 * theme belongs to the screen you are looking at rather than to who you are, so
 * a phone in a dark room and a desktop by a window can reasonably disagree. It
 * also needs no round trip before the first paint, and a theme that arrives
 * late is a visible flash of the wrong colours.
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
 * Writes the attribute the stylesheet keys off, and persists the choice.
 *
 * The default theme sets `data-theme="blue"` explicitly rather than removing
 * the attribute. Both would work — `:root` carries the blue values — but an
 * attribute that is sometimes absent is a thing every future selector has to
 * remember, and a check has no way to tell "default" from "never applied".
 */
export function applyTheme(theme: ThemeId): void {
  document.documentElement.dataset.theme = theme;
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    // The theme still applies for this page; it just will not be remembered.
  }
}
