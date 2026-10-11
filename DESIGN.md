# DESIGN.md — brainlessmusic

Design direction for every UI in this repo (web `frontend/`, Android `android/`). It records decisions the owner has
made: the answers to [A35/A36](.docs/QUESTIONS.md#answered), plus choices already built and explained in the code
(cited). It is direction, not a component spec. Where this file and the code disagree, the code is current; fix
whichever one is wrong, and do not quietly follow either.

## Identity

An arcade rhythm-game music select pointed at your own library. The references are **beatmania IIDX, Sound Voltex,
osu!, DJMAX Respect, maimai and CHUNITHM** (A35). Borrow their composition and behaviour, not their artwork or logos.

What that means in practice, as already built:

- **The list moves, the cursor does not.** The selected entry stays fixed and everything else slides past it. "A cursor
  walking down a static list is a file browser; a list travelling under a fixed cursor is a machine offering you
  things." (`frontend/src/components/ArcadeSelect.tsx:47-50`)
- **Chosen item large on one side, names on the other.** (`ArcadeSelect.tsx:48`)
- **Content band plus a side panel of scrolling geometric graphics** on the title screen. (`TitleScreenPanel.tsx:37-40`, right half of the screen)
- **The player bar is a control deck**, not a media-player strip (commit `93dd81d`).

## Mood

Owner's picks (A35):

- **A machine offering you things.** Browsing should feel like a cabinet presenting songs, not like a file manager.
- **Flat and solid.** Use solid borders for elevation and swap the border colour on focus. No drop-shadow blur, no
  rings, no glow (`frontend/src/index.css:336-339`).
- **Loud backdrop, legible text.** The animated backdrop can be strong. The only limit is that text in front of it stays
  readable (backdrop strength turned up 2026-09-11).

## Never

- **A generic SaaS dashboard:** sidebar, row of stat cards, soft shadows, decorative gradients.
- **Glassy or neon-glow surfaces:** blur panels, glow rings, bloom.

The owner chose no other bans (A35).

## Palette

Colours are theme tokens, never literals. A colour written straight into a rule can't be reached by any theme
(`frontend/src/index.css:263-264`). Tailwind's scale names are **positional**, not hues: `blue-950` is the deepest
ground, `blue-300` is muted text, `orange-600` is the accent (`frontend/src/lib/theme.ts:1-4`). Danger and success
keep their meaning in every theme. Danger moves out of the theme's own hue when the two would clash.
Text on an accent fill uses `--color-on-accent` (the theme's `blue-950`), never white, so it clears 4.5:1 in every
theme (Q45, `frontend/src/index.css:3-6`). Accent-coloured text on a card uses `--color-accent-ink`
(`MaterialTheme.accentInk` on Android): the accent itself except in Deep blue, where it is lightened to clear 4.5:1.

- **Default ("Deep blue", the original):** navy ground `#080e28`, blue backdrop, orange accent
  (`index.css:260-280`, `theme.ts:17`).
- **Alternatives, chosen by the user:** Crimson (after IIDX RED), Void (near-black, accent only), Nord, Magenta (after
  osu!), Pastel (Material tonal). Each names its source in `theme.ts:6-13`. That stated source is their purpose, so
  Magenta's vivid and Pastel's soft palettes are intentional, not defaults.
- The chosen theme is saved on the profile and follows it across devices ([A55](.docs/QUESTIONS.md#a55--the-theme-follows-the-profile-was-q20)).
- A theme controls **colour only** ([A48](.docs/QUESTIONS.md#a48--a-theme-controls-colour-only-was-q19)). On Android, type, shape and layout now belong to a separate **skin** (A117, see Android below); the web has no skins yet.

## Typography

- **Fredoka** (500–700): the wordmark only (`.font-brand`, `index.css:297-300`).
- **Barlow Condensed** (800): track titles at display size (`.font-display`). Narrow and heavy so weight carries the
  title instead of `text-transform`. A third of the library has mixed-script titles, and uppercasing them capitalises
  only the Latin half (`index.css:302-305`).
- Everything else uses the system UI sans.
- Both web fonts load from Google Fonts in `frontend/index.html:18`.

## Motion

- Title-screen animation runs on one tempo, `--beat: 0.4s` (150 BPM), so nothing drifts (`index.css:259-261`).
- The mosaic's wavefront burns orange on the downbeat (`TitleScreenPanel.tsx:37-38`).
- On the title screen and login page, themes cycle with a 4 s cross-fade. A manual pick in Options switches instantly
  (`index.css:239-241`). The cycle is skipped under reduced motion (`useThemeCycle.ts:18`).

## Android

**Same brand as the web** (A36): the navy-and-orange default, flat surfaces, Fredoka and Barlow Condensed.

Built (2026-10-10): the brand palette is the default, not Material dynamic colour (`android/.../ui/theme/Theme.kt`).
`Color.kt` holds the web's Deep blue tokens. Display and headline styles use Barlow Condensed and the wordmark uses
Fredoka (`Type.kt`, fonts in `res/font`). Floating surfaces have a 1 dp `outline` border, not a shadow. All six web themes
are in Settings → Colours (`Color.kt`, one `Palette` each), and each also has a light scheme for the system setting.
Colours also offers Material You (wallpaper colours, Android 12+) as an opt-in. It is never the default.

**Skins** (A114-A119, 2026-10-11): Settings → Appearance → Skin restyles the whole app, the player included; colour stays
with the theme, so any skin can be worn in any colours. **Standard is the app as described above and the default**; a
skin must leave Standard's values untouched. A skin sets typography and Material `Shapes` (`ui/theme/Skin.kt`), the
cover and avatar shape (`coverShape`), card, tile and row shapes (`cardShape`, `tileShape`, `rowShape`), the tap
feedback (a `LocalIndication`), and the shared parts in `ui/common/SkinParts.kt` (playing marker, mini player progress,
bottom-bar tab). Its Now Playing layout lives in `ui/playback/skins/`. Skins borrow a game's controls and composition,
never its artwork, and stay flat: rings and borders, no glow.

- **Hit circle** (after osu!): Fredoka for headings, titles and labels; round covers and avatars; larger corner radii and
  pill rows; a tapped row or tile gets an approach ring closing on the finger; the mini player and tab bar float as
  outlined pills and bottom sheets float as outlined cards (`SkinSheet`), the mini cover is ringed by progress; the selected tab is ringed (no pill); icons are Font Awesome
  Free, as osu!lazer uses (`AppIcons`, CC BY 4.0, credited in Settings → Licenses); the player is `HitCircleDeck`. Magenta is its matching colour theme.
