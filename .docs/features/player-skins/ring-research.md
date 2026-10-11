# Ring skin research: maimai DX

Research for the Ring skin, the third card in the mockup ([mockup.html](mockup.html)). It covers maimai DX's cabinet,
play screen, scoring, music select and look, then sets out hypotheses for the design to test. The current arcade
version is **maimai DX MAGiCAL** (Japan, from 2026-09-17); the international site still shows CiRCLE PLUS. The
screens seen here are from CiRCLE/CiRCLE PLUS. Gathered 2026-10-12 from the sources at the bottom.

**Decided (A129-A132, 2026-10-12):** M PLUS Rounded 1c; MingCute icons; colour theme "Candy" (the mockup's swatch
with the game's navy, for Light and Dark); an achievement % with rank and lamp from plays and skips. The round screen
sits in the centre of the player and uses the full space.

**Design canvas (2026-10-12):** https://claude.ai/artifact/Jm1QQ9zcKcMzYovn7gEoQC (player in Candy light and dark;
Home with the rating plate, song rows and bottom bar). Not readable from here; the owner opens it in a browser.

Unverified items are marked **(unverified)**. They come from memory, not from a source read for this file.

## What the real screens show (official site, CiRCLE PLUS)

The international site's "new features" page ([sources](#sources)) shows real in-game screens cropped to the round
display. The wiki's image CDN refused scripted downloads, so there is **no play-screen or result-screen capture** in
this research; those sections come from text sources.

- **Music select (round screen):**
  - The difficulty is a tab on the top arc ("EXPERT", red), with a yellow "−" tab to its left and a purple "+" tab
    to its right.
  - Under it is a row of genre tabs as coloured rounded chips (GAME & VARIETY green, FAVORITE teal), flanked by small
    yellow round ◀ ▶ buttons, then a scrolling hint ticker.
  - The song is a card: jacket on top, a frame in the difficulty's colour, "EXPERT" with a large level number
    ("LV 12"), the title on a navy band, the artist under it, and NOTES DESIGNER and BPM at the bottom. A small
    badge marks the chart type ("でらっくす" red, "スタンダード" blue). Neighbouring cards sit dimmed on each side.
  - Large sky-blue round ◀ ▶ buttons sit at the left and right edges.
  - A countdown timer ("87") in heavy outlined numerals sits at the bottom centre, with a blue BACK tab bottom left and
    an orange NEXT tab bottom right, both lying along the rim.
  - **Every on-screen control sits next to a physical button.** The −/+ tabs are at the top pair, the arrows at the
    sides and BACK/NEXT at the bottom pair. The screen labels the buttons; it does not replace them.
- **Rating plate:** a yellow plate reading "でらっくす RATING" with the number in five dark boxes, odometer style
  ("16001"), and a medal mark at its right end.
- **RATING UP! / CLEAR!:** huge red block letters with a white outline over a pastel rainbow wash.
- **WORLD STATS panel:** a navy header band with white caps, then rows striped yellow and white: a rank glyph, "CLEAR
  RATE" and a percentage in orange ("80.00 %").
- **Rank glyphs:** S, SS, SSS, SSS+ as bubbly, outlined, gold-filled letters.
- **Brand pages:** grey speech bubbles (`#ECECEC`) with navy text, orange pill buttons, and the mascot Derakkuma,
  whose head wears a segmented ring that echoes the cabinet's button ring.

## The mockup's Ring, as agreed so far

| Part | Mockup |
|---|---|
| Ground | `#eef3fb` pale blue-white, text `#1d2340`, top-bar text `#5a6385` |
| Accents | pink `#ff4fa3`, cyan `#22bff5`, yellow `#ffc928` (the buttons cycle pink, cyan, yellow) |
| Type | Fredoka |
| Cover | a round screen inside a white rim (`#c9d3e8` edge) |
| Progress | a pink ring between the rim and the cover, filling clockwise |
| Buttons | eight round buttons on the rim at 22.5° off the axes, play the large pink one (at 112.5°) |
| Lamp | "SS+" in a pink-to-yellow pill, "14 plays · 52 min" |
| Mood | "the one light skin of the first four" |

## 1. The cabinet: the source of the layout

- **Round touch screen in a white drum.** The DX cabinet still looks like a front-loading washing machine, which SEGA
  leans into ("It's not a washing machine!"). The body is white with a pink top, the screen sits in a round bezel.
- **Eight buttons around the screen**, lit blue on the current cabinet (official cabinet art). They sit at 22.5°,
  67.5°, 112.5° and so on, so **no button sits at 12, 3, 6 or 9 o'clock** (confirmed by the simulator MajdataPlay's
  button prefab, rotated ±22.5°). Buttons are numbered 1 to 8 (MaiConverter docs); 1 is the top-right one and the
  count runs clockwise **(unverified)**.
- **Touch areas** on the screen, named by ring: A (outer, by the buttons), B (inner), C (centre), plus D and E
  between them. Charts address them as "B1", "E5", "C" (MaiConverter docs). Their exact geometry is **(unverified)**.
- **Sub-monitor** above the main screen, a small flat display (cabinet art); it shows the second screen's
  achievement (game option "sub-screen achievement").
- **Two players per cabinet**, four with two linked cabinets. Play is with an Aime card.

**For Ring:** the mockup already copies the panel: eight buttons on the rim at the cabinet's angles. The game's own
rule should carry over too: each control is a button on the rim, and anything on the screen beside it is its label.

## 2. Notes and the play field

- Notes appear in the centre and travel **outward** along eight lanes to the judgement ring, where each lane meets a
  button.
- **Note types** (Wikipedia):

| Note | Look | Worth (in taps) |
|---|---|---|
| TAP | pink ring | 1 |
| HOLD | pink elongated bar | 2 |
| SLIDE | a blue star, then a path of chevrons to trace | star 1, path 3 |
| EACH | any note hit together, turned yellow | as its type |
| TOUCH | small arrows closing on a touch area | 1 |
| TOUCH HOLD | a touch note held, a multicoloured fan **(unverified look)** | as a HOLD |
| BREAK | red-orange and yellow | 5 |
| EX | a glowing outline; any non-miss counts as CRITICAL PERFECT | as its type |

- **The judgement ring takes the difficulty's colour.** The "judgement line design" option includes "Simple: the
  line and dots *without difficulty colours*", so the default ring is tinted by difficulty (gamerch options page).
  Other designs show the sensors or hide the line.
- **The slide star travels around the ring and across the screen.** It is the game's only note that moves along a
  path you trace with your finger.
- Background brightness is a setting (dark to bright, five steps); the song's movie plays behind the field.

**For Ring:**
- Progress as the judgement ring, as in the mockup, is true to the game: the song reaches the ring the way notes do.
- **Seeking is a slide.** A star on the ring that you drag around it is the one maimai gesture with no equivalent in
  the other skins.

## 3. Judgements and achievement

| Judgement | Achievement (non-BREAK) | Note |
|---|---|---|
| CRITICAL PERFECT | full | counts only for the DX score and the BREAK bonus |
| PERFECT | full | |
| GREAT | 80 % | FAST/LATE shown on GREAT and below (option) |
| GOOD | 50 % | |
| MISS | 0 | breaks the combo |

(Moegirl via search; the BREAK columns there were garbled, so BREAK values are left out.)

- **Achievement** is the score: a percentage to four decimals, at most **101.0000%**: 100% from the notes, weighted
  TAP 1, HOLD 2, SLIDE 3, BREAK 5, plus up to 1% from BREAK notes hit CRITICAL PERFECT.
- **Clear** is 80% (rank A).
- **Ranks** (confirmed in the open-source bot akari-bot's mapping and the rank list of a second bot):

| Rank | At or above |
|---|---|
| SSS+ | 100.5 % |
| SSS | 100.0 % |
| SS+ | 99.5 % |
| SS | 99.0 % |
| S+ | 98.0 % |
| S | 97.0 % |
| AAA | 94.0 % |
| AA | 90.0 % |
| A | 80.0 % |
| BBB | 75.0 % |
| BB | 70.0 % |
| B | 60.0 % |
| C | 50.0 % |
| D | below 50 % |

## 4. Lamps, sync and the DX score

- **Combo lamps:** FC, FC+, AP, AP+ (all PERFECT; AP+ all CRITICAL PERFECT, i.e. 101%).
- **Sync lamps** (two players): SYNC, FS, FS+, FDX, FDX+.
- **DX score:** 3 points per note at most, so the maximum is notes × 3 (astrbot plugin). Stars at **85, 90, 93, 95
  and 97 %** of the maximum, confirmed in five codebases (mai-tools, maimai.py, MajdataPlay, RinNET, tomomai); some
  tools add 6 and 7 stars at 99 and 100 %. Points per judgement below CRITICAL PERFECT are **(unverified)**.

**For Ring (the lamp, `clearFor` in `ui/playback/skins/SongRecord.kt:15`):**

| `Clear` | Ring's words |
|---|---|
| NEW | NEW |
| FAILED | under A, no lamp (maimai has no fail banner, only a missed clear) |
| CLEAR | CLEAR |
| FULL_COMBO | FC (AP+ if achievement is 101%; see H5) |

## 5. The play HUD (from the options list)

The play screen is the round field. The square panel's corners outside the circle carry readouts. The gamerch options
page lists what each slot can show:

- **Centre display:** OFF, **Combo (default)**, achievement counting up, achievement counting down from 100% or 101%,
  a border to S/SS/SSS, personal best, DX score up or down. It turns into LIFE for challenges.
- **Outer frame** (the corners): **achievement counting up (default)**, the down variants, DX score, FAST/LATE.
- **Judgement text** appears where the note was hit: five positions or hidden for taps, inside or outside for touch.
  Its colours (PERFECT gold, GREAT pink, GOOD green, MISS grey) are **(unverified)**.
- **Touch reaction effect:** ON, outer ring only, OFF.
- **Note speed** 1 to 10 in quarter steps, then SONIC; mirror ↔ ↕ ↻.

**For Ring:** the centre of the round screen is the cover, so the game's centre readout (combo) sits over it. The
player can show "12 COMBO" on the cover the way Hit circle shows "12x" in its corner, using the same count.

## 6. Music select

From the screenshot in the first section, plus genre names from the akari-bot mapping:

- **Genres:** POPS & ANIME, niconico & VOCALOID, 東方Project, GAME & VARIETY, maimai, ONGEKI & CHUNITHM, 宴会場 (utage).
  Each genre tab has its own colour.
- **Song cards** carry the difficulty as a coloured frame, the level as a large number and the title on a navy band.
- **Navigation** is button-paired: the sides scroll songs, the small upper arrows jump genre, the top tabs change
  difficulty, the bottom pair is BACK/NEXT.
- **A countdown** in large outlined numerals at the bottom.

## 7. Difficulty colours

| Difficulty | Colour |
|---|---|
| BASIC | green |
| ADVANCED | yellow |
| EXPERT | red |
| MASTER | purple |
| Re:MASTER | white (lavender trim) |
| UTAGE | pink-magenta **(unverified)** |

(Names and green, yellow, red, purple, white from akari-bot's Chinese labels 绿黄红紫白.)

## 8. Rating

- **DX RATING** sums the best 35 older charts and best 15 new ones. Each chart gives level × rank factor ×
  achievement (capped at 100.5%) (RemyWiki).
- **The plate's colour shows the tier:** white to 999, blue 1000, green 2000, yellow 4000, red 7000, purple 10000,
  bronze 12000, silver 13000, gold 14000, platinum 14500, rainbow 15000. Rainbow "kiwami" tiers sit above 16000,
  each with stars.

## 9. Look and feel

- **Colours measured** from the official select screen (ImageMagick histogram of the round screen):

| Use | Hex |
|---|---|
| Ground | `#FEFEF9` cream white, `#EEEDEC` warm grey |
| Ink | `#0F3A9C` navy, `#262F4D` dark slate |
| Difficulty frame / NEXT | `#FF674D` coral red, `#F78437` orange |
| Arrow buttons | `#3FB2EA` sky blue, `#3E5BD4` royal blue |
| Pinks | `#FD54AE` hot pink, `#E96AE7` magenta, `#F39197` rose |
| Pastels | `#E2AAF5` lavender, `#AAC1E3` pale blue |
| Yellow | `#F2B62E` gold, `#FEE10A` (rating plate) |
| Green | `#65C75F` |

  The mockup's swatch (`#eef3fb`, `#ff4fa3`, `#22bff5`, `#ffc928`) is close to these. The game's ink is a bluer navy
  than the mockup's `#1d2340`.
- **Type:** the official Japanese site loads **M PLUS Rounded 1c** (500) and **Montserrat** (700) from Google Fonts.
  In-game lettering is heavy, rounded and outlined in white ("EXPERT", "BACK", "NEXT", the timer digits). The game's
  own UI face isn't named anywhere found.
- **Shapes:** circles and rounded tabs everywhere; tabs along the rim follow its curve; cards have rounded corners
  and a thick coloured frame.
- **Lettering style:** white outlines and drop shadows, sticker style. Logos and banners add glitter and rainbow.
- **Mood:** cute, bright, busy, Japanese idol-pop: pastel rainbow washes, stars, paw prints, the mascots.
- **Leave out:** the logos, the characters (Derakkuma, the cat-eared girls), the jackets, glitter and rainbow
  washes. The app is flat with no glow (DESIGN.md "Skins").

## 10. Hypotheses

Each one is a bet the design will test. "Wrong if" says what would disprove it.

- **H1. The rim is the interface.** Ring's identity is the round screen with eight buttons on its rim, and every
  control in the player is one of those buttons, labelled on the screen beside it, the way the select screen labels
  its buttons. A starting map, by the game's own roles:

  | Button (clockwise from top right) | In the game | In Ring |
  |---|---|---|
  | 8 · 1 (top pair) | difficulty − / + | shuffle / repeat (mode switches) |
  | 7 · 2 (upper sides) | genre ◀ ▶ | like / add to playlist |
  | 6 · 3 (lower sides) | song ◀ ▶ | previous / next |
  | 5 (bottom left) | BACK | queue |
  | 4 (bottom right) | NEXT | play / pause (the large one) |

  *Wrong if* the buttons read as decoration rather than controls, or the eight do not fit a 360 dp phone at 48 dp
  touch targets. (A ring of radius about 150 dp gives roughly 115 dp between button centres, which fits.)
- **H2. Progress is the judgement ring, and seeking is a slide.** The song fills the ring clockwise from 12 o'clock.
  A small star rides the ring at the play position; dragging it around the ring seeks. *Wrong if* dragging around a
  circle is too fiddly for exact seeks; a fallback is a drag that seeks by angle anywhere on the ring.
- **H3. Ring is light-first.** maimai is the one light game in the set: cream ground, navy ink. Every palette in
  `ui/theme/Color.kt` is built dark-ground-first, with light used only by the Light mode. Ring's theme needs both
  modes to read as maimai. *Wrong if* Ring in Dark mode still reads as maimai; otherwise Q131 decides whether Ring
  leans light.
- **H4. The font must differ from Hit circle's.** Hit circle already uses Fredoka (DESIGN.md "Skins"), the mockup's
  choice for Ring. M PLUS Rounded 1c is maimai's own site face, rounded and heavy at 800/900, and it carries Japanese,
  which song titles from this game's world often need. *Wrong if* it looks too close to Fredoka on screen, or its
  heaviest weight lacks the outlined punch; then Montserrat ExtraBold for numerals and labels could carry it.
- **H5. The score is an achievement percentage.** Gear shows 0-10,000,000 from plays and skips (A128). Ring shows the
  same honest data in maimai's form: base = 100 × plays / (plays + skips), plus the extra 1% only for a full combo
  (`Clear.FULL_COMBO`), giving 0.0000% to 101.0000% and a rank from the table in section 3. *Wrong if* nearly every
  song lands at SSS+, which happens when skips are rare; then the base needs a curve or a play-count factor.
- **H6. Flat, but sticker.** Energy comes from white outlines, thick coloured frames and the pink, cyan and yellow
  buttons, not glitter or glow. The rank badge is the only place a two-colour gradient might stay (the mockup's
  pink-to-yellow pill). *Wrong if* the gradient breaks the app's flat rule in review; then the badge is solid gold.
- **H7. A tap lights the button.** Hit circle already throws a ring on every tap, so Ring's indication is a cabinet
  button lighting: the touched shape fills to its colour with a white rim, then fades. No expanding ring. *Wrong if*
  it is too subtle on lists.
- **H8. Home's listening card is the rating plate.** A five-digit odometer number on a plate whose colour climbs
  maimai's tiers (white, blue, green, yellow, red, purple, bronze, silver, gold, platinum, rainbow), from the best 50
  songs' achievements the way DX RATING is built. *Wrong if* no honest formula fills the range; then DX-score stars
  per song are the simpler card.
- **H9. App-wide parts come from the select screen.** Library tabs as genre chips, each its own colour; queue rows as
  song cards with a coloured frame and a navy title band; sheets as the navy-banded WORLD STATS panel; the bottom bar
  as a white plate of round lit buttons, the selected one filled pink. *Wrong if* the cards are too tall for a
  scrolling list; then only the current row gets the full card.

## Questions

Answered as A129-A132 in [QUESTIONS.md](../../QUESTIONS.md), all as recommended:

- **Q129** Ring's font: M PLUS Rounded 1c (recommended), or Fredoka shared with Hit circle?
- **Q130** Ring's icons: which set? Font Awesome, Lucide and Phosphor are taken.
- **Q131** Ring's colour theme: the mockup's swatch, and does Ring lean light?
- **Q132** Ring's score: an achievement % and rank from plays and skips (H5)?

## Sources

- [maimai DX International: About](https://maimai.sega.com/play/) (eight buttons, cabinet art) ·
  [New features, CiRCLE PLUS](https://maimai.sega.com/play/newfunction/) (the in-game select, rating and stats screens) ·
  [maimai.sega.com](https://maimai.sega.com/) (key art with the cabinet) · [maimai.sega.jp](https://maimai.sega.jp/)
  (MAGiCAL, the Google Fonts it loads)
- [Wikipedia: Maimai (video game)](https://en.wikipedia.org/wiki/Maimai_(video_game)): cabinet, note types,
  judgements, achievement, versions
- [4Gamer, MAGiCAL launch, 2026-09-17](https://www.4gamer.net/games/043/G104364/20260917028/): current version,
  cabinet photo
- [RemyWiki: maimai DX Rating](https://silentblue.remywiki.com/maimai_DX:Rating): rating formula, rank factors, tiers
- [gamerch maimai wiki: game options](https://gamerch.com/maimai/871937): centre and frame displays, judgement line
  design, touch effect
- [akari-bot maimaidx_mapping.py](https://github.com/Teahouse-Studios/akari-bot/blob/master/modules/maimai/libraries/maimaidx_mapping.py):
  rank thresholds, FC/AP and sync lamps, difficulties, genres
- DX-score stars: [mai-tools dx-star.ts](https://github.com/myjian/mai-tools/blob/master/src/common/dx-star.ts),
  [maimai.py](https://github.com/TrueRou/maimai.py), [MajdataPlay](https://github.com/TeamMajdata/MajdataPlay)
  (also the ±22.5° button prefab)
- [MaiConverter: how to make charts](https://github.com/caxerx/MaiConverter/blob/master/how_to_make_charts.md):
  buttons 1-8, touch areas A-E
- [Moegirl: maimai](https://zh.moegirl.org.cn/Maimai): judgement weights (via search; the page body did not load)
