# Review of the 2026-10-10 Android theme session

The work reviewed is the five commits from the session that built the Android brand theme and its follow-ups:
c9a148e (web accent-ink), 677c732 (Android theme, colour themes, Settings tab, pull to refresh, Songs filter,
splash), 59a2d35 (debug builds are their own app), 84aa8e1 and b6b5f94 (debug build workflow). Later sessions reworked
some of this code (search button, Settings pages, splash fixes), so every finding was checked against `main` at
c7e0152 (v0.3.11), not against the original commits. Tick each box when it is fixed, and name the commit that fixed it.

Results at review time:
- Read-only review. Nothing was built or run.
- Web contrast was computed with a WCAG script on the real backgrounds.
- The CI debug APK's signer was compared with `~/.android/debug.keystore`. They match.

## Fix first

- [x] **F1. Tapping a filtered song can play the wrong song.** Fixed in ca945ba. `LibraryViewModel.kt:70-78` sets `shownSongFilter`
      inside `flatMapLatest`, when the new pager starts. The old list stays on screen until the new first page
      arrives, which takes about one request.
      - A tap in that gap passes an index from the old list to `playSongsFrom()` (`:130-139`), which fetches it from
        the new filter. A different song plays, and the queue tops up from the filter.
      - Fix: tag each row with the filter it was loaded under. For example, map the pager's `PagingData<TrackSummaryDto>` to
        rows that carry `filter`, and pass the filter with the tap. Then `shownSongFilter` can go.

## Needs an owner answer

- [ ] **F2. Android colours don't follow the profile ([Q79](../QUESTIONS.md#q79--should-android-colours-follow-the-profile-too)).**
      The Colours setting was built per phone on Q20's assumption. A55 (built 2026-10-11, `fe0608f`) moved the theme
      to the server (`users.theme`, `/auth/me`, `PUT /me/theme`), and only the web syncs it. Android has a seventh
      choice, Material You, that the web lacks.
      - Recommended answer is A: sync the six web themes, and keep Material You on the phone only.
      - The comment on `AppearanceSettings.colorTheme` ("Per phone… (Q20)") goes stale either way.

## Minor

- [ ] **F3. Failed pull-to-refresh is silent.** `AlbumDetailViewModel.refresh()` (`:43-49`) and
      `ArtistDetailViewModel.refresh()` (`:38-44`) drop the failure: the spinner stops and the old content stays,
      with no message. The Library lists (`LibraryScreen.kt` `PagedContent`) behave the same when a refresh fails
      with items on screen. Fix: a short "Couldn't refresh" snackbar.
- [ ] **F4. The in-app splash ignores the app's light/dark choice.** `SplashScreen.kt` paints `R.color.window_background`,
      which follows the phone's setting, not `ThemeMode`. It shows only when the session check outlasts the 1.2 s system
      splash. With the app forced to Dark and the phone on Light, that start is a light splash and then a dark app.
      The system splash can't know the app's setting, so the in-app one is the only part that can be fixed.
- [ ] **F5. The debug APK name uses an internal AGP API.** `android/app/build.gradle.kts` renames the debug output
      through `applicationVariants.all` and `BaseVariantOutputImpl`. It works on AGP 8.5.2, but is likely to break on
      AGP 9. Revisit when AGP is upgraded.

## Checked, no issue

- Web `text-accent-ink` clears 4.5:1 in all six themes where it is used. The Control center "Degraded" pill and the
  Full view's "N selected" bar sit on the ~`blue-950` ground (about 6:1). They are not on `blue-900` cards.
- The CI debug workflow signs with the shared debug key, and the run checks this itself.
- Log out from inside the Settings pages still pops to Login (`popUpTo(Routes.ARTISTS) { inclusive = true }`).
- Closing Library search clears the Songs filter.
- The splash staying up as a blank screen was fixed in `d44d6ba`.
