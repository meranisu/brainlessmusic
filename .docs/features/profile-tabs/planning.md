# Standard radar + Stats and Friends as tabs on your profile

## Context
The owner wants the listening radar on the Standard skin (Android), which A135 kept to a plain numbers card. They also
want "Your listening" (Android `StatsScreen`, web `StatsPage`) and Friends (Android `FriendsScreen`, web `FriendsPage`)
to move off their own pages and become tabs on **your own** profile, with the stats page renamed **Stats**.
Answered in chat on 2026-10-21: Android and web; the name is "Stats"; tabs on your own profile only; the radar goes on
Standard Home and profile.

Tabs: **Profile · Stats · Friends**. Other people's profiles stay as they are, with no tabs.

antislop: global preference `during`. Announce `antislop active: during (global preference).` before the first edit.

## 1. Radar on Standard (Android)
- `android/.../ui/profile/ListeningRadar.kt`: split the `Canvas` block out of `ListeningRadar` into a
  `RadarChart(values, grow, modifier)` composable in the same file. `ListeningRadar` (Gear) keeps its look and calls it.
- `android/.../ui/profile/ListeningCards.kt` `StandardListening` (line 115): keep the "Listening" title, the "Since …"
  line and `ListeningTotals`, then add `RadarChart` below them. Plain styling, sentence case, no "LISTENING RADAR"
  game label. Use the same `radarValues`/`rangeDays` and the same grow-in animation (off when animations are off).
  It needs an `owner` param for the content description, so the profile call site passes it like the other skins do.
- Call sites with no other change: `YouScreen.kt:187` and `ProfileScreen.kt:437` (add `owner = owner`).

## 2. Android: tabs on your own profile
- `Routes.kt`: `PROFILE = "people/{userId}?tab={tab}"`, `fun profile(userId: Int, tab: String? = null)`, and
  `ARG_PROFILE_TAB`. Remove `STATS` and `FRIENDS`.
- `BrainlessNavGraph.kt`: drop the `Routes.STATS` and `Routes.FRIENDS` screens (lines 279, 320). Add an optional
  string `tab` navArgument to PROFILE. Pass `ProfileScreen` the extra callbacks that Stats/Friends need
  (`onOpenProfile`; the rest are already there).
- `StatsScreen.kt`: turn the body into `StatsContent(onOpenArtist, onOpenAlbum, modifier, viewModel = hiltViewModel())`
  with no Scaffold, top bar or MiniPlayer. Delete `StatsScreen`. Update the "Go back and open Stats again" empty
  line to fit a tab.
- `FriendsScreen.kt`: same: `FriendsContent(onOpenProfile, onOpenPlaylist, modifier)`. Its
  `DisposableEffect` polling then runs only while the tab is showing.
- `ProfileScreen.kt`: `enum class ProfileTab(label) { PROFILE("Profile"), STATS("Stats"), FRIENDS("Friends") }`, start
  tab from the nav arg, `rememberSaveable`. When `p.isSelf`, show the tab bar under the top bar and render the
  current LazyColumn, `StatsContent` or `FriendsContent`. Otherwise no change. The edit-profile page and dialogs stay
  where they are.
- Tab bar: generalise `LibraryTabBar` (`LibraryScreen.kt:280`) and its skin variants (`SlantTabs`, `DifficultyTabs`,
  `GenreChips`) from `LibraryTab` to `labels: List<String>, selected: Int, onSelect: (Int) -> Unit`. Move them to
  `ui/components/SkinTabBar.kt` so the profile tabs match each skin. Library passes `LibraryTab.entries`.
- `YouScreen.kt:194,201`: "See all your stats" goes to `Routes.profile(me.id, "stats")` and "See what friends are
  playing" goes to `Routes.profile(me.id, "friends")`. Hide them while `me` is null.

## 3. Web: tabs on your own profile
- `pages/StatsPage.tsx` and `pages/FriendsPage.tsx`: export `StatsPanel` and `FriendsPanel` with the page `<h1>`
  removed (the profile header gives the context). Delete the page exports.
- `pages/ProfilePage.tsx`: when `data.isSelf`, show a `role="tablist"` (copy the keyboard handling from
  `ChangelogDialog.tsx:205`) for Profile · Stats · Friends, stored in `?tab=` with `useSearchParams`. The Profile
  tab is the current content.
- `App.tsx:77,83`: `/stats` and `/friends` become small redirects to `/people/${user.id}?tab=stats|friends`, so old
  links and bookmarks still work.
- `AppShell.tsx:53,56`: remove the Friends and Stats entries from More.

## 4. Docs
- `.docs/QUESTIONS.md` Answered: A245–A248 "(asked in chat)" for the four answers. A245 supersedes A135's "Standard
  has no radar".
- Add `.docs/CHANGELOG.md` and `.docs/FUNCTIONLOG.md` entries, newest first. Update the STATUS row only if the state moved.
- Android release notes: when tagging, not as part of this change.

## Verification
- `free -h` first. `cd android && ./gradlew assembleDebug testDebugUnitTest`. `ListeningRadarTest` must pass.
- `cd frontend && npm run build && npm run lint`.
- Web: run the dev site (:5180) with Playwright. Check that your profile shows the three tabs and other profiles show
  none, that `?tab=` survives a reload, that `/stats` and `/friends` redirect, and that keyboard arrows move between tabs.
- Android: emulator (`scripts/emulator.sh`). Check the Standard radar on Home and profile, the tabs on each skin, the
  Home buttons opening the right tab, and Back from a tab leaving the profile.
- No backend change, so `npm test` is not needed.

## Unresolved questions
- None.
