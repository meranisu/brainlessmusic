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
  outlined pills (the tab bar a shade up, `tabBarColor`) and sheets open as an outlined card in the middle of the screen (`SkinSheet`, A124), the queue numbers its rows like a combo (`QueueMarker`, "12x" count), the mini cover is ringed by progress; tabs are outlined circles, the selected one a lit hit circle with an approach ring closing on it (no pill), names in Fredoka; icons are Font Awesome
  Free, as osu!lazer uses (`AppIcons`, CC BY 4.0, credited in Settings → Licenses); the player is `HitCircleDeck`, whose slider shows osu!'s reverse arrow at its end on repeat one, and whose cover carries osu!'s combo counter at
  its bottom left ("12x", the songs played through in a row). Home reads your listening as a beatmap under the range picker
  (`HitCircleListening`): the six readings of Gear's radar as numbered hit circles ringed to their value, under a large
  circle with the overall one. Magenta is its matching colour theme.
- **Lane** (after Arcaea, A121-A123): Exo 2 throughout, light at display sizes; panels with two opposite corners cut on
  the diagonal (`laneCut`), parallelogram rows (`SlantShape`), corner-cut covers; a tap flings a dashed ring from the
  finger; diamonds mark the playing song, the selected tab and the mini progress head; sheets open as a card in the middle
  of the screen with two corners cut (`SkinSheet`; long ones, like the queue, scroll inside it). Icons are Lucide line icons at a 1.5 stroke (ISC, credited in Settings → Licenses). The player is
  `LaneDeck`: an information pane, a slanted score banner in Arcaea's words (Track lost/complete, Full recall, Pure
  memory; grades D to EX+), and the song as a four-lane track in perspective that fills to a judgement line and seeks
  by vertical drag, notes falling toward it while playing; buttons are hexagons on a floor a shade apart (full-bleed,
  under an edge line), play a diamond, and a tap pops "PURE"; the track's far part shows the combo (songs played through in a row).
  Home gives your listening as Arcaea's potential (`LaneListening`): the six readings' mean on 0.00 to 13.00 in a diamond badge
  coloured by band, the six as slanted bars. The selected tab is a lit parallelogram key, names in Exo 2.
  Lavender (phone-only) is its matching colour theme. Nothing floats in Lane: the mini player and tab bar dock (the tab
  bar under an edge line, `EdgeLine`, a shade up from the mini player, `tabBarColor`), the mini player's play is a small diamond (`MiniPlayButton`), the
  Library's tabs are a docked strip of slanted segments, and
  segmented pickers cut their outer ends (`segmentShape`).
- **Gear** (after SOUND VOLTEX, A125-A128; research in `.docs/features/player-skins/gear-research.md`): Orbitron for
  display, headlines and labels, Chakra Petch for titles and text; every panel chamfered, rows cut to a point on the
  right like the game's song-select entries; a tap flashes a square chip with a frame thrown out around it. Icons are
  Phosphor Bold, Fill for play, pause and a liked heart (MIT, credited in Settings → Licenses). The player is
  `GearDeck`: a banner with the jacket (a difficulty box on its corner from the play count: NOV, ADV, EXH, MXM), a
  score strip (10,000,000 × plays ÷ plays and skips, eight digits rolling up, the game's grade S to D, its clear medal),
  the lane in the game's black with a cyan wall left and magenta right, the red critical line climbing it (tap or drag
  to seek) with the knob cursors on it lit for shuffle and repeat, chips falling while playing, and beside it a gauge
  that turns from blue to pink once the play counts (A113's threshold). The console sits on a band a shade apart:
  knobs for shuffle and repeat whose notch turns per mode, white BT keys for previous, play (wide) and next, orange FX
  keys for like and add (hidden for guests); a press pops "CRITICAL". The lane's black, the lasers' cyan and magenta,
  FX orange and the critical red are fixed in every theme (`GearLaserRight`, `GearFx`, `GearCritical`). The bars
  dock under a cyan edge; tabs are BT keys, the open one lit; the mini player's progress is a laser with the critical
  line's red tick, its play a small white key; the Library's tabs are the game's difficulty boxes (`GearDifficultyColors`);
  the queue numbers coming tracks "01", "02" on keys; sheets open as a chamfered card in the middle of the screen.
  Voltage (phone-only) is its matching colour theme. The lane shows the CHAIN (songs played through in a row since
  the app started, broken by a skip) as the game does, and Home adds a listening radar under the range picker, six
  axes in the EFFECT RADAR's colours (`ListeningRadar`).
- **Ring** (after maimai DX, A129-A132; research in `.docs/features/player-skins/ring-research.md`, design canvas
  linked there): M PLUS Rounded 1c throughout (bundled cut down to Latin, symbols and kana; kanji fall back to the
  phone's Japanese face), extra-bold for display and labels; soft, generous corners, list rows as rounded cards, covers
  rounder than Standard's; a tap lights a cabinet button under the finger (a filled disc with a pale rim that fades, no
  spreading ring). Icons are MingCute 3.0.2, the line set with Filled for play, pause, skip and a liked heart (Apache
  2.0, credited in Settings → Licenses). The player is `RingDeck`: the cabinet as wide as the phone, centred in the
  space above the title, the cover as its round screen; the song's progress is the judgement ring, filling clockwise
  from 12 o'clock in the song's difficulty colour from your play count (BASIC under 3, ADVANCED to 9, EXPERT to 19,
  MASTER to 49, Re:MASTER from 50; a tab on the top arc names it with the count as its level), the slide star rides
  its head, and a drag that starts on the ring between buttons seeks by angle. The eight buttons sit on the ring at
  the cabinet's angles (none on an axis), clockwise from the top right: repeat, add to playlist, next, play (large,
  where maimai has NEXT), queue, previous, like, shuffle; lit means on, unlit is the bezel's colour edged in the
  button's. The time sits in the bottom gap; the combo stands on the cover as maimai's centre readout. Under it the
  achievement (100% × plays ÷ plays and skips, plus 1% for a full combo, four decimals rolling up), its rank D to SSS+
  in outlined gold, and the lamp (CLEAR, FC). The sky, yellow and navy are fixed in every theme (`RingSky`,
  `RingYellow`, `RingInk`, `RingDifficulties`). Tabs are round cabinet buttons, the open one lit; the mini player's
  progress is a rounded bar with the slide star at its head, its play a small lit button; the Library's tabs are
  maimai's genre chips, a colour each; sheets open as a rounded card in the middle of the screen. Candy (phone-only,
  made for light as much as dark) is its matching colour theme. Home adds a DX RATING plate (`RingListening`): the
  six readings' overall on maimai's 0 to 16,750 scale in five digit boxes, the plate in its tier's colour (rainbow as
  flat bands).

Home (owner, 2026-10-12; A134-A137) opens with the range picker, then the skin's listening card, which carries the
range's hours, plays and songs and the change against the window before (`ListeningTotals`); Standard's card has only
those (`StandardListening`). Then Recently played and the top lists. Listen together is an icon in its top bar; liked
songs and playlists are the Library's Playlists tab; Hear less is in Settings → Playback.

Switching tabs (`TabTransitions.kt`) is short and alike in both directions: Standard fades through, Hit circle pops
in, Lane slides along, Gear slams in, Ring bounces in. Opening a page keeps the plain crossfade.
The bar under the tabs is one shared bar (`SharedTabBar`), so it stays still while the page changes.

The heart is tap to like, hold to dislike, tap to clear (A148), on every skin's like button (`FeelingHeart`): a like
pops it with a burst in the skin's shape, a dislike cracks it in two. The Library's Playlists tab leads with Liked songs
as a card under a game label (COLLECTION, PACK, FAVORITE, MY LIST), then Disliked songs, then the playlists as a cover
grid (A147).

The player opens from the mini player and closes in the skin's game (`PlayerEntrance.kt`, A145, A146): Standard a plain
sheet up and down; Hit circle zooms out of the mini player's cover like osu! starting a map; Lane Arcaea's song-start
shutter; Gear SOUND VOLTEX's fast slam, a slanted lit edge leading; Ring a maimai circle growing from the cover. A swipe
down carries on off the bottom at the finger's pace instead.

Floating buttons (`SkinFab`) and short messages (`Notices`) take the skin's form too: a hit circle, a diamond,
console keys, a lit cabinet button; messages as the skin's panel. Standard keeps Material's button and the system toast.

Changing skin plays a short intro over the app (`SkinTransition`): Standard fades its name, Hit circle lands an
approach ring and bursts, Lane closes and opens Arcaea's shutter, Gear runs the lane in and slams the critical line
across with a jolt, Ring lights its eight buttons clockwise as the slide star runs the ring. About 1.4 s; a tap skips it; off with animations off.

Signing in plays a welcome (`ArcadeWelcome`) after a sign-in, or when the app opens on a saved session, in the skin's
game's manner. Standard drops a player card into a reader, the reader's light sweeps it ("CARD READ"), then "Welcome back"
and the name. Hit circle follows osu!lazer's "Welcome" intro: the word unfolds in a disc ringed by visualiser bars, the disc
beats twice and the name shows. Lane opens the app from behind Arcaea's shutter, with a lock diamond and a slanted name plate.
Gear runs SOUND VOLTEX's entry: the lasers, ENTRY, the appeal card, then the critical line and GAME START. Ring pops maimai's
round screen open, "Welcome!" bounces in, and the name plate drops in. About 2 s; a tap skips it.

The sign-in screen is an arcade title screen (A143, A144): the skin's attract loop behind the wordmark band (Standard:
the web's beat mosaic; Hit circle osu!'s menu; Lane Arcaea's title; Gear SOUND VOLTEX's lane; Ring maimai's button
chase), TAP TO START, then the form over a calmer loop.

An account's first sign-in on a phone goes through a short setup (`SetupScreen`, A139): what the app is, the look (the app
restyles as you pick), three playback switches, what it can use (notifications, the update install switch;
storage needs nothing), done; then the welcome plays in the chosen skin.

Signing out plays the welcome in reverse (`ArcadeGoodbye`, A138): Standard's card leaves the reader ("See you"), Hit
circle's disc says "see you next time" and folds away, Lane's shutter closes and opens on sign-in, Gear's card slides
out to THANK YOU FOR PLAYING, Ring's plate lifts off to "See you next play!" and the screen shrinks shut. About 1.6 s.
