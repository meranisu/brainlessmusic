# Gear skin research: SOUND VOLTEX

Research for the Gear skin, the fourth in the mockup's order ([mockup.html](mockup.html), card 4). It covers SOUND
VOLTEX's play screen, scoring, screens and look, with notes on what Gear can use. Most of it is from EXCEED GEAR (SDVX VI,
2021-2025); the current arcade version is SOUND VOLTEX ∇ (from 2025-12-24), which adds finer sub-levels and a profile
section. Gathered 2026-10-11 from the sources at the bottom.

**Decided (A125-A128):** Orbitron for display/labels/numbers with Chakra Petch for body; Phosphor icons (Bold, Fill
for play/pause/heart); colour theme "Voltage" from the mockup's swatch; a score and grade from plays and skips.

## What the real screens show (official screenshots, 4Gamer, 2021)

- **Play (portrait):** jacket centred at the top over the lane; score top left on a cyan bar, a pink bar top right;
  black lane with thin white lane lines, a cyan edge left and magenta right, converging to the horizon; the chain
  count in the middle of the lane in wide digits with dim leading zeros ("0011"); a hexagon badge at the right; the
  critical line with a magenta hit burst; under it, **the console drawn on screen**: cyan knob left, magenta knob
  right, four white BT keys, two orange FX keys. The mockup's control layout is exactly this.
- **Result:** dark angular panels with chamfered corners and slanted bars in cyan and yellow; "COMPLETE" in wide,
  heavy, squared letters; the score in big digits with smaller trailing digits; the grade badge ("AAA"); the level
  ("09") bottom right in wide italic digits.
- **Lettering:** wide, squared, heavy; A without a crossbar. Closest free match: Orbitron Bold/Black.

Unverified items are marked **(unverified)**. They come from memory, or only from a clone's code, not from a
written source.

## The mockup's Gear, as agreed so far

| Part | Mockup |
|---|---|
| Ground | `#0a0f2c` navy, text `#eef4ff` |
| Accents | cyan `#00e5ff` (left knob), magenta `#ff2fd0` (right knob), orange `#ff8a1f` (FX), yellow `#ffe14a` (lamp) |
| Type | Rajdhani (Google Fonts, OFL), song title in uppercase |
| Song | in a banner skewed -8° with a 2 px cyan border |
| Progress | climbs a 4-column lane to a red judgement line (`#ff3355`), with the time beside it. The left lane wall is cyan and the right is magenta |
| Transport | BT keys: previous, a wide play key, next |
| Like / add | two orange FX keys under the BT row |
| Shuffle / repeat | the two knobs, cyan left and magenta right |
| Lamp | "Ultimate chain", "14 plays", level "Lv 17" in the top bar |

## 1. The controller: the source of the layout

- **Two knobs (VOL-L, VOL-R)** sit at the top corners. Each one follows a laser: left is blue/cyan, right is
  pink/magenta. The player can change both colours (ラインカラー, Laser Colour Left/Right). Other colours exist:
  GRAVITY WARS added yellow and green.
- **Four BT buttons** in a row: white, square, for white chip notes.
- **Two FX buttons** below them: black, wide, each spanning two BT lanes. They hit orange notes. FX chips look red on
  EXCEED GEAR.
- **START** sits at the top centre and is blue. START plus a knob changes lane speed during play.
- The Valkyrie cabinet adds a touch sub-monitor under the main screen, for options and song search. The main screen
  runs at 120 Hz.

**For Gear:** the mockup's control layout copies the panel itself: knobs at the corners, BT across, FX below. Gear is
the only skin with knobs, so shuffle and repeat should *turn* like knobs, with a rotate drag or a tap that steps them.
Leave START out, because Play already has the wide BT key.

## 2. Notes and the lane

- The lane is a long highway running into the distance with **four BT lanes** and **two FX lanes**. The FX lanes
  overlap BT lanes 1+2 and 3+4. Analog lasers run outside and across it.
- **Note types:**
  - BT chip: white.
  - Long BT: a hold.
  - FX chip: orange.
  - Long FX: orange, adds a sound effect.
  - Special FX chip: yellow.
  - Analog chain (laser): a ribbon in the knob's colour.
  - Slam: a laser jumping sideways at a right angle, hit with a quick flick.
- **The CRITICAL LINE** is a horizontal bar near the bottom of the screen where notes are hit. Two **laser cursors**
  (pointers) ride along it, one per knob, in the knob's colour.
- **The lane moves.** Lasers tilt the whole lane, slams jolt it, and charts can zoom, spin, shake or show the lane from
  above (GRAVITY WARS on). A **BPM change warning** shows before tempo changes.
- **Lane covers and speed:** lane speed (Hi-SPEED) is shown to hundredths on EXCEED GEAR. During a BPM change the new
  value shows in red (faster) or blue (slower).

**For Gear:**
- The mockup's "progress climbs the lane" turns SDVX inside out. Instead of notes falling to the line, the played part
  fills the lane up to the judgement line.
- A truer version: the lane runs into the distance and the line sits near the bottom. The song's remaining part
  scrolls down toward the line as it plays, the way Lane's falling notes work now (`ui/playback/skins/Lane.kt`).
- **Cursors on the line:** two small pointers, cyan and magenta, could show the shuffle and repeat states, so the knobs'
  state reads on the lane.
- **Tilt:** a few degrees of roll while scrubbing (dragging the seek) is the game's most recognisable motion. It must
  stop when animations are off.

## 3. Judgements, chain and score

| Judgement | Window | EX points | Hit flash (EXCEED GEAR) |
|---|---|---|---|
| S-CRITICAL | ±20.83 ms (Valkyrie only, an option) | 5 | white, its own "S" splash |
| CRITICAL | ±41.67 ms | 4 | yellow |
| NEAR | (unverified) | 2 (half a CRITICAL in score) | purple |
| ERROR | miss | 0 | breaks the chain |

- **CHAIN** is the game's word for combo. It counts holds and laser ticks too.
- **EARLY / LATE** text shows near the line: EARLY red, LATE blue by default, swappable to IIDX's colours. An
  optional ±ms readout exists.
- **Score** runs from 0 to **10,000,000**, shown as eight digits. **EX SCORE** is a second count, shown when
  S-CRITICAL is on, with an optional "distance to max" readout.

**For Gear:**
- **Score from listening (recommended):** score = 10,000,000 × plays / (plays + skips) for the song, shown as an
  eight-digit counter that rolls up on open. It uses the same plays and skips the lamp already uses (`clearFor`,
  `ui/playback/skins/SongRecord.kt:15`). It is honest data in the game's exact form, and it gives a grade (section 4).
- **CHAIN:** songs finished in a row without a skip, this session. "CHAIN 12" sits on the lane. A skip resets it, like
  an ERROR. This is client-side only and needs no backend.
- **Tap feedback (`LocalIndication`):** a square chip flash at the touch point in yellow (CRITICAL). It stays flat, a
  filled square fading out with no bloom.

## 4. Clear marks and grades

**Clear medals**, lowest to highest, with the colour each lamp uses:

| Medal | Colour | Means |
|---|---|---|
| NO PLAY | none | never played |
| PLAYED | dull green | failed (TRACK CRASH) |
| COMPLETE | green | cleared on EFFECTIVE |
| COMPLETE (EXCESSIVE) | purple | cleared on the hard gauge |
| ULTIMATE CHAIN | magenta | no ERRORs (full combo) |
| PERFECT ULTIMATE CHAIN | gold | all CRITICAL, 10,000,000 |

**Grades**, from HEAVENLY HAVEN onward, by score:

| Grade | Score at or above |
|---|---|
| S | 9,900,000 |
| AAA+ | 9,800,000 |
| AAA | 9,700,000 |
| AA+ | 9,500,000 |
| AA | 9,300,000 |
| A+ | 9,000,000 |
| A | 8,700,000 |
| B | 7,500,000 |
| C | 6,500,000 |
| D | below 6,500,000 |

**End-of-track banners:** TRACK COMPLETE, TRACK CRASH, ULTIMATE CHAIN, PERFECT. The clone's script confirms these four.

**For Gear, mapped onto `clearFor`:**

| `clearFor` | Gear lamp | Colour |
|---|---|---|
| NEW | NO PLAY | outline only |
| FAILED | TRACK CRASH, or PLAYED | dull green |
| CLEAR | TRACK COMPLETE | green |
| FULL_COMBO | ULTIMATE CHAIN | magenta |
| FULL_COMBO with 10+ plays | PERFECT ULTIMATE CHAIN | gold, as Lane's "Pure memory" does at 10+ plays |

The grade comes from the listening score above. Medal and grade sit side by side in the strip, as on the music
select.

## 5. Gauges

| Gauge | Behaviour | Colour |
|---|---|---|
| EFFECTIVE RATE | starts at 0%; **clear at 70%**, where the gauge turns from blue to pink and the background changes | blue, then pink |
| EXCESSIVE RATE (hard) | starts at 100%; −9% per ERROR; at 0, TRACK CRASH; below 30% it turns blue | pink, then blue |
| ARS | EXCESSIVE that drops to EFFECTIVE instead of failing | |
| PERMISSIVE RATE | course mode; refilled only by CRITICALs | orange |
| DIVINE RATE | course mode; refilled only by S-CRITICALs | yellow |
| BLASTER | | rainbow |
| HEXATIVE | | gold |

The gauge is a tall vertical bar on the right of the play screen with a percent tag **(unverified; the clone's
layout)**.

**For Gear (the strongest find):** the app already has a real clear line. A play counts once half the song or 4
minutes has played (A113). Draw the seek gauge in **blue until that point, then pink**: "clear" is exactly when the
song counts as a play. It is true to the game and true to the data. The lane background can also shift when it flips,
as the game's does at 70%.

## 6. The play screen layout

Layout from the open-source clone (USC), which copies SDVX's arrangement **(unverified against the arcade)**:

- **Top left, the song panel:**
  - jacket, 100×100
  - title, then artist
  - a difficulty box over the jacket's corner: "EXH 17"
  - BPM
  - a thin progress bar
- **Top right:** the eight-digit score in a box, with the difference from your best under it (red with "−" when
  behind).
- **Right edge:** the vertical gauge with its % tag.
- **Centre, above the line:** the chain number, pulsing on each hit. It turns gold on a still-full-combo run and green
  on a still-perfect one. EARLY/LATE shows above it.
- **Bottom:** the critical line, the two laser cursors, and the console picture under it in portrait.
- **Intro:** the HUD slides in over about 2 s. **Outro:** the screen dims and the banner text fades in.
- **Laser alerts:** a boxed "L" or "R" in the laser colour flashes at the side before a laser starts.

**For Gear's Now Playing, top to bottom:**

1. Bar: "Now playing" with a level box.
2. Song banner, skewed, cover as the jacket, with the difficulty box on the cover's corner.
3. Score strip: eight-digit score, grade, medal, plays.
4. Lane with the line, cursors and chain.
5. BT row.
6. FX row.

That is the mockup's order, now with the game's real parts.

## 7. Difficulty colours and the music select

The game has five difficulty tiers. Each has a short code, a colour and a usual level range:

| Tier | Code | Colour | Usual levels |
|---|---|---|---|
| NOVICE | NOV | blue-purple | 1–5 |
| ADVANCED | ADV | yellow | 6–13 |
| EXHAUST | EXH | red | 12–17 |
| 4th slot | MXM, INF, GRV, HVN, VVD or XCD | varies (below) | 14–20 |
| ULTIMATE | ULT | gold and black | 20 (one chart) |

The fourth slot holds a different tier per song:

| Code | Colour |
|---|---|
| MXM | black/white |
| INF | purple |
| GRV | brown-orange |
| HVN | blue |
| VVD | pink |
| XCD | cyan |

**Music select:** EXCEED GEAR went back to a **vertical list**, as in the first game, BOOTH. Each row shows:

- the jacket
- the title
- the difficulty boxes, coloured, with levels
- the clear medal and grade for the selected difficulty

Folders include LEVEL folders. Locked songs show a lock. The right knob scrolls songs and the left knob changes
difficulty.

**EFFECT RADAR** (EXCEED GEAR) is a hexagon chart of a chart's character, with six axes clockwise:

| Axis | Colour |
|---|---|
| NOTES | cyan |
| PEAK | red |
| TSUMAMI ("knob") | pink |
| TRICKY | yellow |
| HAND-TRIP | purple |
| ONE-HAND | green |

A **PLAYER RADAR** for the player came later.

**For Gear:**

- **Library rows:** a vertical list. The cover is the jacket, and the right end of the row holds a small medal and
  grade. Rows can skew like the banner (Lane's rows are slanted the same way, `rowShape`).
- **"Level" needs a real number.** Options:
  - the song's play-count tier
  - its length (minutes, capped at 20)
  - left out

  I recommend leaving it out of rows and keeping "Lv" only in Now Playing's bar, as the play count tier.
- **Library tabs** (Songs, Albums, Artists, Genres): difficulty boxes in NOV, ADV, EXH and MXM colours. One colour per
  tab gives four tabs four colours, which the game makes look natural.
- **A listening radar on the You screen:** a hexagon of six real stats, each axis in the game's colours. Candidate
  axes:
  - plays
  - minutes
  - distinct artists
  - finish rate
  - late-night share
  - new songs tried

  Flat lines only. It is the most "SDVX" thing the app could show, and it uses data the stats endpoint already
  serves. Its own step, after the skin.

## 8. Player rank: VOLFORCE, classes, skill levels

- **VOLFORCE (VF):** a skill rating, the sum over the player's **best 50** charts. Each chart's value is level × score
  × grade coefficient × clear coefficient. The exact coefficients are **(unverified)**, roughly:
  - grade: S 1.05, AAA+ 1.02, AAA 1.00, down to D 0.80
  - clear: PUC 1.10, UC 1.05, hard 1.02, clear 1.00, played 0.50
- After a credit a **"FORCE +PLUS"** animation shows the VF gain.
- **VF classes** **(unverified)**: Sienna, Cobalt, Dandelion, Cyan, Scarlet, Coral, Argento, Eldora, Crimson, Imperial,
  each with four stars. The class is shown as a coloured emblem next to the player name.
- **Arena classes**, by VF minimum: U ≥ 20, S ≥ 19, A ≥ 18, B ≥ 17, C ≥ 16, D ≥ 14–15.
- **SKILL ANALYZER** courses: dan 01–11 and ∞, with frames for silver wings, gold wings, halo and divine halo.

**For Gear:** a "VF" on the You screen from the best 50 songs' listening scores would be fun. It is profile work,
not skin work. Park it with the radar.

## 9. Screens around play: entry and results

- **Entry:**
  1. Tap the card.
  2. PIN.
  3. Mode select.
  4. Appeal card (avatar).
  5. "My Room" with a navigator character.
  6. GAME START.
- **Result:**
  - clear medal
  - score
  - grade
  - judgement counts (S-CRITICAL, CRITICAL, NEAR, ERROR)
  - max chain
  - a gauge graph
  - then "FORCE +PLUS"

  EXCEED GEAR's result screen is described as minimal.
- **Total result** after the credit, then "Continue?".

**For Gear:**

- **ArcadeWelcome** (`ui/splash/ArcadeWelcome.kt:48`) needs a Gear label. "ENTRY" fits better than a brand term.
  "Welcome back" stays.
- **SkinTransition** (`ui/theme/SkinTransition.kt:72`) needs a Gear intro. Recommended: the lane rushes in from the
  horizon, the critical line slams across with the two cursors, and "GEAR" lands with a slam jolt. A "TRACK START"
  feel in about 1.4 s.
- **End of song (optional):** when a song ends on its own, a short "TRACK COMPLETE" over the lane. When it's skipped
  after counting, still COMPLETE. When skipped before, "TRACK CRASH". It needs animations on, and it's quiet: text
  only, no sound.

## 10. Look and feel (EXCEED GEAR's "Valkyrie" design)

- **Theme:** Valkyries and "exceeding limits with the GEAR". The **hexagon** is EXCEED GEAR's motif: the emblem, the
  radar, the Exceed gear gauge.
- **Colours:**
  - deep navy/black grounds
  - cyan and magenta from the lasers
  - orange from FX
  - yellow for CRITICAL
  - purple for NEAR
  - white for S-CRITICAL
- **Type:** EXCEED GEAR's UI face isn't named anywhere. Fans guess custom lettering close to Apex, Perfect Dark or
  Bulletproof, all commercial or unlicensed. **Rajdhani** (in the mockup) is a free square, condensed, technical face
  in the same family of feeling.
- **Motion:** the lane tilts, slams jolt, the HUD slides in, and numbers roll up.
- **Glow:** the game is heavy on bloom and its "VALKYRIE EFFECT", which can be turned off. **The app's rule wins:
  flat, no glow** (DESIGN.md "Skins"). Gear gets its energy from colour, skew and motion, not light.
- **Leave out:** logos, the navigator characters (RASIS and the rest), jackets and system music. The mockup's rule is
  controls and mood only.

## 11. App-wide parts, the way Hit circle and Lane did them

| Part | Gear |
|---|---|
| Typography | Rajdhani throughout. Display and titles bold and uppercase, body Medium |
| Shapes | skewed (parallelogram) for banners and rows, chamfered hexagon ends for buttons (`CutCornerShape(50)` on the short side gives a hex key) |
| Indication | square chip flash, yellow |
| Mini player | progress drawn as a thin lane with the red critical line, cursors at its ends; play as a small BT key |
| Bottom bar | docked, dark console. Tabs as BT keys; the selected one fills white with navy ink |
| Sheets | docked; the header is a skewed banner with a cyan edge; drag handle two knob rings joined by a line |
| Library tabs | difficulty-coloured boxes (NOV, ADV, EXH, MXM colours) |
| Queue | rows numbered as track numbers "TRACK 01", the current one marked with laser cursors |
| Icons | Phosphor Bold, Fill for play, pause and heart (A126) |
| Theme | "Voltage" (A127), the mockup's swatch, phone-only like Lavender (A116) |

## Questions

Q125-Q128 were answered as A125-A128 (see the top of this file).

## Sources

- RemyWiki: [SOUND VOLTEX EXCEED GEAR](https://remywiki.com/AC_SDVX_EG) ·
  [Glossary](https://remywiki.com/SOUND_VOLTEX_Glossary) · [What is SOUND VOLTEX](https://remywiki.com/What_is_SOUND_VOLTEX) ·
  [SKILL ANALYZER](https://remywiki.com/SKILL_ANALYZER) · [EX Score](https://remywiki.com/EX_Score)
- voltexes.com: [Play options guide](https://voltexes.com/exceed-gear-play-options-guide/) ·
  [Arcade quick start](https://voltexes.com/arcade-quick-start-guide-eg/) · [Effect radar](https://voltexes.com/effect-radar/) ·
  [Location test summary](https://voltexes.com/sound-voltex-exceed-gear-location-test-summary/)
- [SDVX Compendium: game modes](https://www.sdvx.org/en/compendium/game-modes)
- [USC default skin, gameplay.lua](https://github.com/Drewol/unnamed-sdvx-clone/blob/develop/bin/skins/Default/scripts/gameplay.lua):
  the play-screen layout, from an open-source clone
- [rg-stats VOLFORCE](https://rgstats.readthedocs.io/en/stable/algorithms/volforce/) (inputs only; coefficients not
  given there)
- Font guesses: [ZiV Bemani font thread](https://zenius-i-vanisher.com/v5.2/thread?threadid=1016&page=78),
  [dafont forum](https://www.dafont.com/forum/read/514869/sdvx-exceed-gear-font)
