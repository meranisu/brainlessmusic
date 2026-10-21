# Mixes: collage covers, a page per mix, a full 30 songs

## Context
Owner request (2026-10-21). Daily mixes (A234-A236) show only the first song's cover, and a tap starts playing at
once, so you can't see what's in a mix. The owner wants:
- a cover made of the mix's songs, with a mix icon at the bottom left, as Spotify and YouTube Music do;
- a tap opens the mix as a playlist page that lists its songs;
- 30 songs per mix.

`DAILY_MIX_SIZE` is already 30 (`backend/src/services/mix.ts:151`). A mix falls short when each seed's radio
(`limit: perSeed * 2`) runs out of new songs. The fix tops it up. It cannot go past what the library has for that genre.

The earlier profile-tabs work is still unverified: the Android build was stopped, and the web build passed. Verify it
together with this work.

## 1. Backend: fill mixes to 30
- `backend/src/services/mix.ts` `getDailyMixes()`: after the round-robin, while `chosen.size < DAILY_MIX_SIZE`, ask
  each seed's `buildRadio` again with `exclude: [...chosen]` and `limit: DAILY_MIX_SIZE`, and add picks until 30 or
  until no new songs come back. No API change.
- `backend/src/services/mix.test.ts`: a case where the first pass gives fewer than 30 and the library has enough;
  the mix comes out at 30.

## 2. Android
- **Cover:** new `MixCover(covers, modifier)` in `ui/profile/` that reuses `CoverMosaic`
  (`ui/downloads/DownloadsScreen.kt:600`) as a 2x2 of the first four distinct album covers. A small round badge sits
  at the bottom left with `AppIcons` radio/mix glyph (pick the existing icon `DailyMixes` web uses: radio). The badge
  sits on a solid disc so it reads over any cover.
- `YouScreen.kt` `CoverRow` (line 520): take an optional `coverContent: @Composable (T) -> Unit` slot, used for
  mixes. "Mixes for you" cards open the mix: `navController.navigate(Routes.mix(it.id))`. The `onClickLabel`
  becomes "Open mix".
- **Mix page:** `Routes.MIX = "mix/{mixId}"` and `ARG_MIX_ID`, plus a screen in `BrainlessNavGraph.kt`.
  New `ui/profile/MixScreen.kt` + `MixViewModel`: loads `libraryRepository.getDailyMixes()` (cached on the server
  for the day) and picks the mix by id. Layout follows `PlaylistDetailScreen`: a large `MixCover` header, "<Genre> mix",
  "30 songs · today, from what you play", then Play (`SkinExtendedFab`) and Shuffle (`SkinFab small`) like the
  playlist page (`PlaylistDetailScreen.kt:523`), then the song rows. Tapping a row plays the mix from that song.
  The rows long-press to `SongMenuSheet`. Play and the rows keep today's behaviour of going on as a radio after the
  mix (`YouViewModel.playMix` uses `startRadio`). Shuffle shuffles the mix. Loading, error and "mix gone" (the day
  changed) states use `LoadStateContent`.
- `YouViewModel.playMix` moves to `MixViewModel`.

## 3. Web
- **Cover:** new `components/MixCover.tsx`: a 2x2 grid of `CoverArt kind="albums"` for the first four distinct
  albums (falls back to track covers, then one cover when there are fewer than four), with a `RadioIcon` badge
  bottom-left. Sizes: thumb (menu, 40px) and large (page header).
- `components/DailyMixes.tsx`: menu items show `MixCover` and become links to `/mixes/:id` in place of starting
  the radio. Off in a room as now.
- New `pages/MixPage.tsx` at `/mixes/:id` (under `RequireAccount` in `App.tsx`): reads the `['mix','daily',user.id]`
  query (`fetchDailyMixes`, `lib/mix.ts`). It shows the header (large cover, name, count), Play (`startRadio(first,
  tracks)`, as the menu did), Shuffle, and `SongRows` (`components/ListeningParts.tsx:71`). Handles loading, error
  and not-found states.

## 4. Docs
- `.docs/QUESTIONS.md`: A250 "(asked in chat)" for this request.
- `.docs/CHANGELOG.md` and `.docs/FUNCTIONLOG.md` entries.
- No migration, so no schema doc change.

## Verification
- `cd backend && npm test`. Run it alone, and check no other session is running tests (shared test.db).
- `cd frontend && npm run build && npm run lint`, then check the page in a browser with Playwright on :5180. The
  local DB has no genres, so expect no mixes unless the real DB copy is used (memory: try-on-real-library-safely).
- `free -h`, then `cd android && ./gradlew assembleDebug testDebugUnitTest`. This also verifies the profile-tabs
  work. If an emulator fits in RAM, check Home's mix cards and the mix page there.

## Unresolved questions
- None.
