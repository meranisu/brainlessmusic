# Function Log

Backfilled 2026-09-03 (didn't exist before). Covers functions added/materially changed in the 6 commits since the initial commit (2026-09-03 → 2026-09-03 — this project is one day old). Newest first. Log new/changed functions here going forward, per the planning workflow in `.docs/CLAUDE.md`.

---

**Function:** `SkinSheet()` (changed): `android/.../ui/common/SkinParts.kt`
**Date:** 2026-10-11
**How added:** owner request
**Purpose:** Lane's sheets open as a centred card, like Hit circle's.
**Side effects:** none.
**Before:** Lane docked a ModalBottomSheet with its top-left corner cut and a slanted drag handle.
**After:** every game skin opens a Dialog card capped at 85% height (Lane's cut on two corners, Hit circle's rounded); Standard still docks.

**Function:** `tabBarColor()` (changed): `android/.../ui/common/SkinParts.kt`; `AppBottomBar()` (changed): `android/.../ui/navigation/LibraryBottomBar.kt`
**Date:** 2026-10-11
**How added:** owner request
**Purpose:** Hit circle's floating tab bar reads apart from its mini player.
**Side effects:** none.
**Before:** the shade-up fill was Lane only; Hit circle's pill was `surfaceContainer`, like its mini player.
**After:** every game skin's tab bar is `surfaceContainerHighest`; Standard unchanged.

**Function:** `LaneIcons` (regenerated): `android/.../ui/theme/LaneIcons.kt`; `tabBarColor()` (new): `android/.../ui/common/SkinParts.kt`
**Date:** 2026-10-11
**How added:** bug fix (owner report); owner request
**Purpose:** Lane's polygon-based icons draw again; its tab bar sits a shade apart from the mini player.
**Side effects:** none.
**Before:** seven Lane icons were invalid path data and drew nothing; the tab bar matched the mini player's fill.
**After:** all 48 draw; Lane's tab bar is `surfaceContainerHighest`.

**Function:** `segmentShape()`, `SkinDragHandle()`, `EdgeLine()`, `MiniPlayButton()`, `dockedHeader` (new): `android/.../ui/common/SkinParts.kt`; `SlantTabs()` (new), `LibraryTabBar()`, `HeaderButton()`, `SongFilterField()` (changed): `android/.../ui/library/LibraryScreen.kt`
**Date:** 2026-10-11
**How added:** owner request
**Purpose:** Lane's tabs, bars, sheet handles and segmented pickers docked and drawn in Arcaea's shapes.
**Side effects:** none. `MiniPlayer`, `AppBottomBar`, `QueueSheet`, `YouScreen` and `SettingsScreen` call them.
**Before:** Lane drew Material's floating tab pill, round segment ends, Material's handle and play icon button.
**After:** Lane docks and slants them; Standard and Hit circle draw what they did.

**Function:** `ArcadeWelcome()`, `SkinMark()` (new): `android/.../ui/splash/ArcadeWelcome.kt`; `StartViewModel.welcome()`, `welcomed()` (new): `android/.../ui/splash/StartViewModel.kt`
**Date:** 2026-10-11
**How added:** owner request
**Purpose:** an arcade card-in with "Welcome back" and the name on the way into the app.
**Side effects:** takes touches while it plays; a tap ends it.
**Before:** the app went straight from the splash or sign-in to Home.
**After:** after a sign-in or a cold start on a saved session, about 2 s of welcome over Home.

**Function:** `SkinSheet()` (changed): `android/.../ui/common/SkinParts.kt`
**Date:** 2026-10-11
**How added:** owner bug report
**Purpose:** keep the sheets' outline on the card, and open Hit circle's in the middle of the screen (A124).
**Side effects:** Hit circle ignores `sheetState` and `dragHandle`. Lane's handle is placed by `SkinSheet`, so it loses Material's collapse/dismiss accessibility actions; the scrim and Back still dismiss.
**Before:** border and padding passed through `ModalBottomSheet`'s `modifier`, drawn apart from the moving card.
**After:** Hit circle: a centred `Dialog` card. Lane: the panel drawn inside the content of a transparent sheet.

**Function:** `NowLoading()` (new): `frontend/src/components/NowLoading.tsx`; `RequireAuth()`, `App()` (changed)
**Date:** 2026-10-11
**How added:** owner request
**Purpose:** an arcade loading screen for the waits after a refresh.
**Side effects:** none.
**Before:** `RequireAuth` rendered nothing while the session was checked; the route fallback was a small "Loading…" line.
**After:** both render `NowLoading`.

**Function:** `LaneDeck()`, `ScoreStrip()`, `LaneTrack()`, `drawLane()`, `LaneButton()`, `PlayDiamond()`, `Pure`, `PureText()` (new): `android/.../ui/playback/skins/Lane.kt`
**Date:** 2026-10-11
**How added:** owner request (A121)
**Purpose:** the Lane skin's Now Playing, after Arcaea.
**Side effects:** seeks through the same `onFraction`/`onFinished` as the other players.
**Before:** nothing, new.
**After:** Lane's player as described in DESIGN.md "Skins".

**Function:** `LaneTypography`, `LaneShapes`, `laneCut()`, `SlantShape`, `LaneHitIndication` (new); `typography()`, `shapes()`, `cardShape`, `tileShape()`, `rowShape`, `coverShape()` (changed): `android/.../ui/theme/Skin.kt`
**Date:** 2026-10-11
**How added:** owner request (A121, A122)
**Purpose:** Lane's design tokens and tap feedback.
**Side effects:** none.
**Before:** two skins.
**After:** a third, Lane; Standard and Hit circle unchanged.

**Function:** `Diamond()`, `SkinSheet()`, `MiniProgress()`, `MiniCover()`, `PlayingMarker()`, `tabColors()`, `TabIcon()` (changed or new): `android/.../ui/common/SkinParts.kt`
**Date:** 2026-10-11
**How added:** owner request (A121)
**Purpose:** Lane's shared parts.
**Side effects:** none.
**Before:** Standard and Hit circle only.
**After:** Lane branches; Standard and Hit circle unchanged.

**Function:** `LaneIcons`, `lucide()` (new, generated): `android/.../ui/theme/LaneIcons.kt`; `pick()` (changed): `AppIcons.kt`
**Date:** 2026-10-11
**How added:** owner request (A123)
**Purpose:** Lucide line icons for Lane.
**Side effects:** none.
**Before:** `pick` chose between Material and Font Awesome.
**After:** a third set under Lane.

**Function:** `SkinTransition()` (new): `android/.../ui/theme/SkinTransition.kt`
**Date:** 2026-10-11
**How added:** owner request
**Purpose:** a short intro naming the new skin when it changes.
**Side effects:** takes touches while it plays; a tap ends it.
**Before:** a skin change restyled the app instantly.
**After:** about 1.4 s of intro over the restyled app; none with animations off or at launch.

**Function:** `AuthRepository.syncTheme()` (changed): `android/.../data/repository/AuthRepository.kt`
**Date:** 2026-10-11
**How added:** hardening (new phone-only theme)
**Purpose:** a phone-only colour theme survives sign-in.
**Side effects:** none new.
**Before:** only Material You was kept over the profile's theme; Lavender would have been overwritten at every sign-in.
**After:** any theme without a web id is kept.

**Function:** `QueueMarker()` (new): `android/.../ui/common/SkinParts.kt`; `QueueSheet()`, `QueueRowItem()` (changed): `android/.../ui/playback/QueueSheet.kt`
**Date:** 2026-10-11
**How added:** owner request
**Purpose:** Hit circle's queue reads as an osu! combo: numbered circles in play order and an "Nx" count.
**Side effects:** none.
**Before:** Hit circle's queue marked only the playing song, with a small ring.
**After:** every row has a circle (filled for the playing song, numbered ahead, faded behind); Standard unchanged.

**Function:** `drawReverseArrow()` (new); `HitCircleDeck()` (changed): `android/.../ui/playback/skins/HitCircle.kt`
**Date:** 2026-10-11
**How added:** owner request
**Purpose:** repeat one marks the slider's end with osu!'s reverse arrow.
**Side effects:** none.
**Before:** the slider looked the same in every repeat mode.
**After:** with repeat one, an end circle with a back arrow sits at the slider's end, pulsing every 600 ms while playing.

**Function:** `SkinSheet()` (new): `android/.../ui/common/SkinParts.kt`
**Date:** 2026-10-11
**How added:** owner request
**Purpose:** the app's bottom sheet; Hit circle floats it as an outlined card off the edges.
**Side effects:** none. `QueueSheet`, `AddToPlaylistSheet`, `SongMenuSheet` and `UpdateSheet` now call it.
**Before:** every sheet was a docked `ModalBottomSheet` in every skin.
**After:** Standard docks as before; Hit circle floats 12 dp off the sides and bottom, above the navigation bar.

**Function:** `ProfileRepository.callApi()` (changed): `android/.../data/repository/ProfileRepository.kt`
**Date:** 2026-10-11
**How added:** bug fix (owner report)
**Purpose:** a stats request cancelled by a newer range tap stays a cancellation, not an error.
**Side effects:** every ProfileRepository call now rethrows `CancellationException`; other failures are unchanged.
**Before:** `runCatching` turned cancellation into a `ConnectionException`, so Home flashed an error on quick range taps.
**After:** cancellation is rethrown, matching `LibraryRepository.callApi()`.

**Function:** `Hit`, `rememberHit()`, `HitBurst()` (new); `HitButton()`, `PlayCircle()` (changed): `android/.../ui/playback/skins/HitCircle.kt`
**Date:** 2026-10-11
**How added:** owner request
**Purpose:** a tapped player circle bursts like a clicked circle in osu!.
**Side effects:** none.
**Before:** the circles only rippled.
**After:** each tap swells a fading accent ghost of the circle.

**Function:** `HitButton()` (changed): `android/.../ui/playback/skins/HitCircle.kt`
**Date:** 2026-10-11
**How added:** owner request
**Purpose:** shuffle and repeat read as on at a glance in the Hit circle player.
**Side effects:** none.
**Before:** on tinted only the icon.
**After:** on fills the circle in the accent, like the play circle.

**Function:** `LicensesContent()`, `CreditRow()`, `LicenseText()` (new): `android/.../ui/settings/LicensesContent.kt`; `SettingsPage.LICENSES` (new), `SettingsScreen()`, `SettingsPageScreen()` (changed)
**Date:** 2026-10-11
**How added:** owner request
**Purpose:** one place crediting the app's license and everything it ships, as the CC BY and OFL licenses ask.
**Side effects:** reads two raw text resources when a license is opened.
**Before:** the Font Awesome credit was a line under Settings → Appearance → Skin; nothing else was credited in the app.
**After:** Settings → Licenses lists the app, fonts, icons and libraries with their licenses.

**Function:** `AppIcons` (new, every icon by meaning), `OsuIcons` (new, Font Awesome vectors): `ui/theme/`; `MiniCover()`, `tabColors()`, `floatingBars` (new), `MiniProgress()` (changed): `ui/common/SkinParts.kt`; `MiniPlayer()`, `LibraryBottomBar()`, `SettingsScreen()` and 20 other screens' icon references (changed)
**Date:** 2026-10-11
**How added:** owner request
**Purpose:** Hit circle uses osu!'s icon set, rings the mini player's cover with progress, and floats the bottom bars.
**Side effects:** none.
**Before:** Material icons everywhere; docked mini player with a progress line; Material's pill on the selected tab.
**After:** under Hit circle: Font Awesome icons, ring progress round the cover, floating outlined pills, ringed tab only.

**Function:** `Skin`, `PlayerButtons` (new enums, replace `PlayerSkin`), `AppearanceSettings.skin` / `setSkin()` / `playerButtons` / `setPlayerButtons()`: `data/local/AppearanceSettings.kt`; `LocalSkin`, `cardShape`, `tileShape()`, `rowShape`, `coverShape()`, `ApproachRingIndication` (new): `ui/theme/Skin.kt`; `BrainlessMusicTheme()` (changed, `skin`); `PlayingMarker()`, `MiniProgress()`, `TabIcon()`, `markPlaying` (new): `ui/common/SkinParts.kt`; `CoverImage()`, `CoverMosaic()`, `MiniPlayer()`, `LibraryBottomBar()`, album `TrackRow()`, queue rows, `SettingsScreen()` (changed)
**Date:** 2026-10-11
**How added:** owner request (A117-A119)
**Purpose:** a skin restyles the whole Android app; Hit circle is the first, Standard keeps the original look.
**Side effects:** new DataStore key `skin`; `controls_style` now holds only Standard/Pills (a stored `HIT_CIRCLE` is read as the skin).
**Before:** a player skin changed only Now Playing.
**After:** the skin sets type, shapes, covers, tap feedback, mini player, bottom bar and the player across every screen.

**Function:** `UpdateRepository.skip()`, `UpdateViewModel.skip()` (removed); `UpdateRepository.checkOnLaunch()`, `UpdateSheetHost()` (changed): `android/.../update/`, `ui/update/`
**Date:** 2026-10-11
**How added:** owner request (reverses A105)
**Purpose:** one way to wave off an update, Later.
**Side effects:** none.
**Before:** a skipped version stayed quiet on launch until a newer one came out.
**After:** every version is offered on the daily launch check until installed.

**Function:** `HitCircleDeck()`, `HitButton()`, `PlayCircle()` (new): `android/.../ui/playback/skins/HitCircle.kt`; `clearFor()`, `recordLine()`, `rememberAnimationsOn()` (new): `skins/SongRecord.kt`; `SeekCanvas()` (new, split from `SeekBar()`): `ui/playback/SeekBar.kt`; `SongActionsViewModel.record()` (new); `NowPlayingScreen()` (changed); `getTrackStat()` (changed): `backend/src/db/listeningStats.ts`
**Date:** 2026-10-11
**How added:** owner request (A114-A116)
**Purpose:** the first rhythm-game player skin, Hit circle, and the per-song score strip with a clear lamp.
**Side effects:** one `GET /me/stats/tracks/:id` per song while a skin with a record is on (accounts only).
**Before:** Settings offered Standard or Pills buttons; per-song stats had no skip count.
**After:** Settings → Player skin offers Standard, Pills, Hit circle; per-song stats include `skips`.

**Function:** `PillRow()`, `Pill()`, `RingPlayButton()`, `barsFromPeaks()`, `placeholderBars()`, `drawWaveform()`, `ControlsStyleOption()`, `LibraryRepository.waveform()`, `ApiService.waveform()` (new); `TransportRow()`, `NowPlayingScreen()`, `SeekBar()` (changed): `android/.../ui/playback/`, `ui/settings/SettingsScreen.kt`, `data/`
**Date:** 2026-10-11
**How added:** owner request
**Purpose:** an optional Pills look for the Now Playing buttons and a Waveform seek bar drawn from the server's peaks.
**Side effects:** one `GET /tracks/:id/waveform` per track while the Waveform style is on (cached in memory); new DataStore key `controls_style`.
**Before:** one button layout; seek styles had no use for the waveform.
**After:** Settings picks Standard or Pills, and Waveform is a sixth progress-bar style.

**Function:** `lazyPage()` (new): `frontend/src/lib/lazyPage.ts`; lazy page constants in `App.tsx`, `auth/RequireAuth.tsx` (changed)
**Date:** 2026-10-11
**How added:** bug fix
**Purpose:** a page chunk that fails to load (stale tab after a deploy) reloads the page once instead of blanking it.
**Side effects:** one `window.location.reload()`; writes `brainlessmusic.chunkReloadAt` to `sessionStorage`.
**Before:** a missing chunk unmounted the app to a blank page until a manual refresh.
**After:** the page reloads itself onto the new build; a repeat failure within 10 s still throws.

**Function:** `AppSignature()` (new): `android/.../ui/settings/SettingsScreen.kt`; `LibraryScreen()` top bar: `ui/library/LibraryScreen.kt`
**Date:** 2026-10-11
**How added:** owner request
**Purpose:** the app mark sits beside the Fredoka wordmark at the foot of Settings, with the version under it.
**Side effects:** none.
**Before:** the mark sat beside "Library" in the Library title; Settings ended with a plain "brainlessmusic x.y.z" line.
**After:** Library's title is text only; Settings ends with mark + wordmark + version.

**Function:** `StartRow()`, `Avatar()`, `ListCard()`, `CardActions()` (new); `PlayerCard()`, `GuestCard()`, `GuestHomeList()`, `YouScreen()` (changed); `ShuffleLibraryButton()` (removed): `android/.../ui/profile/YouScreen.kt`
**Date:** 2026-10-11
**How added:** owner request
**Purpose:** Home layout: Shuffle library and Listen together as a labelled row under the player card, a compact player card, top lists in bordered cards with Play/Shuffle at the foot.
**Side effects:** none.
**Before:** Shuffle and a Listen together icon in the top bar; a tall player card; top lists loose on the page with icon buttons beside the heading.
**After:** as above.

**Function:** `MainActivity.onDestroy()` (new), `MainActivity.keepPlayingWhenSwipedAway` (new): `android/.../MainActivity.kt`; `PlaybackService.onTaskRemoved()` (logging)
**Date:** 2026-10-11
**How added:** bug fix
**Purpose:** a second place that pauses on a swipe from recent apps when "Keep playing when swiped away" is off (A58).
**Side effects:** pauses the player through `sessionPlayer`; two Logcat lines.
**Before:** only `PlaybackService.onTaskRemoved` paused; on a Pixel the music played on.
**After:** on Android 12+ the activity's destroy pauses too; both log what they saw.

**Function:** `recordScrobble()` (`skipped` parameter), `listHistoryForUser()`, `listHistoryForTrack()`, `countHistoryForTrack()`: `backend/src/db/plays.ts`; `getUserStats()`, `getTrackStat()`, `previousRanks()`: `backend/src/db/listeningStats.ts`; `lastPlayedByUser()`: `backend/src/db/shuffledTracks.ts`; `POST /tracks/:id/scrobble`: `backend/src/routes/tracks.ts`
**Date:** 2026-10-11
**How added:** new feature
**Purpose:** record songs cut short before the scrobble threshold as skips (A113).
**Side effects:** inserts `play_history` rows with `skipped = 1`; those never touch `tracks.play_count` / `last_played_at`.
**Before:** only plays past the threshold reached the server; every stat counted every row.
**After:** skips count toward time listened and Recently played only; plays, top lists, a track's shared history and shuffle recency ignore them.

**Function:** `recordSkip()` (new), `beginTrack()`, `stop()`: `android/.../playback/PlaybackController.kt`; `PendingPlays.add()` (`skipped`), `send()`: `playback/PendingPlays.kt`; `LibraryRepository.scrobble()` (`skipped`); `PendingPlay.skipped`, `DownloadDatabase.MIGRATION_3_4`: `downloads/DownloadDatabase.kt`
**Date:** 2026-10-11
**How added:** new feature
**Purpose:** the app sends a song that ended before the threshold as a skip, with the time heard; offline it queues like a play (A113).
**Side effects:** one `POST /tracks/:id/scrobble` per skipped song that played at all; Room schema version 3 → 4.
**Before:** a song skipped before half (or 4 minutes) sent nothing.
**After:** it is recorded as a skip on the server.

**Function:** `parseVersion()`, `compareVersions()`, `notesWithoutInstalling()`, `pickOffer()` (new): `android/.../update/Releases.kt`; `UpdateRepository` (`checkOnLaunch`, `checkNow`, `later`, `skip`, `download`, `installIntent`) (new): `update/UpdateRepository.kt`; `UpdateSheetHost`, `UpdateViewModel` (new): `ui/update/`; Settings "Check for updates" row: `SettingsScreen.kt`
**Date:** 2026-10-11
**How added:** new feature
**Purpose:** in-app updates from GitHub Releases (A104–A106).
**Side effects:** a request to `api.github.com` at most once a day; downloads an APK into the app cache; opens Android's installer.
**Before:** friends updated by downloading the APK from the releases page by hand.
**After:** the app offers a newer release with its notes and installs it after the person confirms.

**Function:** `onMenuClick()` (new): `frontend/src/components/AppShell.tsx`; `NavOverflow` (`onNavigate` prop), `NavItem.detail`: `frontend/src/components/NavOverflow.tsx`
**Date:** 2026-10-11
**How added:** owner request
**Purpose:** the More menu's links go through the arcade card, so Listen together has a transition like the tabs.
**Side effects:** none.
**Before:** menu links navigated at once with no card.
**After:** Listen together and the phone's repeated tabs play the card first.

**Function:** `RoomSocket`, `ClockEstimator`, room models (new): `android/.../rooms/`; `RoomSession`, `RoomUiState` (new): `rooms/RoomSession.kt`; `enterRoom()`, `followRoom()`, `exitRoom()`, `syncToRoom()`, `applyRoomQueue()`, `roomSetPlaying()`, `roomPlay()`, `onRoomPlayWhenReady()` (new), transport and session-player overrides (room branch): `playback/PlaybackController.kt`; `TogetherScreen`, `TogetherViewModel` (new): `ui/together/`; `createRoom`, `myRoom`, `lookupRoom`: `ApiService.kt`
**Date:** 2026-10-11
**How added:** new feature
**Purpose:** Listen together on Android (room sync spec step 4): the phone joins a room and plays in step with it.
**Side effects:** one WebSocket to `/api/rooms/ws` while in a room; `GET /rooms/mine` on every sign-in.
**Before:** rooms were web-only; Android had no room mode.
**After:** the Android player follows a room's state, and its controls (in the app and on the lock screen) drive the room.

**Function:** `ChangelogDialog`, `DownloadApk`, `WebNotes`, `AndroidNotes`, `Inline` (new): `frontend/src/components/ChangelogDialog.tsx`; `WEB_CHANGELOG` (new): `frontend/src/lib/webChangelog.ts`; `parse()`, `dateOf()` (new): `frontend/scripts/android-notes.mjs`; `TitleScreenPage` (version button): `frontend/src/pages/TitleScreenPage.tsx`
**Date:** 2026-10-11
**How added:** owner request
**Purpose:** a What's new window from the title screen with web and Android notes, and a download of the latest APK.
**Side effects:** one request to `api.github.com` when the Android tab opens; the prebuild step rewrites `src/lib/androidChangelog.json` when the notes change.
**Before:** the version on the title screen was static text; no changelog in the app.
**After:** VER opens the window; Android notes come from the existing release-notes files.

**Function:** `AdminDashboard` (new): `frontend/src/pages/AdminDashboard.tsx`; `FadersIcon` (new): `icons.tsx`; `navItemsFor()`, header button: `AppShell.tsx`; routes: `App.tsx`
**Date:** 2026-10-11
**How added:** owner request
**Purpose:** Upload and Users become tabs of the Control Center, which gets its own header button.
**Side effects:** none.
**Before:** three separate admin pages behind the More menu.
**After:** one tabbed dashboard behind an admin-only header button; old addresses redirect.

**Function:** `UploadQueueList` (`scrollable` prop, failed box), `hintFor()`, `extensionOf()` (new): `frontend/src/components/UploadQueueList.tsx`; `UploadError` (new), `uploadWithProgress()`, `runUpload`, `retry`: `frontend/src/components/UploadProvider.tsx`; `ScrollTopButton` (new): `frontend/src/components/ScrollTopButton.tsx`, rendered by `AppShell`
**Date:** 2026-10-11
**How added:** owner request
**Purpose:** a long upload batch stays in a scrolling box on the Control Center; failures are listed apart with details and a hint; any long page has a way back to the top.
**Side effects:** a passive window scroll listener (one rAF per scroll burst).
**Before:** the upload list grew the page; failures sat inline among other rows with only the message; no back-to-top.
**After:** capped scrolling box in the Control Center, a Failed (n) box with status, size, type, time, hint and Retry all, and a Back to top button.

**Function:** `RoomCard`, `memberState()` (new), `ControlCenterPage` (rooms query and section): `frontend/src/pages/ControlCenterPage.tsx`; `AdminRoomsResponse` (new type): `frontend/src/types/api.ts`
**Date:** 2026-10-11
**How added:** new feature (room sync spec step 3)
**Purpose:** the admin's view of live rooms and how far each listener is from the room.
**Side effects:** polls `GET /admin/rooms` every 5 s while the page is open.
**Before:** rooms were visible only through the API.
**After:** the Control Center lists them with per-person drift.

**Function:** `RoomClient` (new: `connect`, `send`, `status`, `leave`, `stop`, `serverNow`), `expectedPositionMs()`: `frontend/src/lib/roomClient.ts`; `RoomProvider`, `useRoom()` (new): `frontend/src/components/RoomProvider.tsx`; `TogetherPage` (new): `frontend/src/pages/TogetherPage.tsx`
**Date:** 2026-10-11
**How added:** new feature (room sync spec step 2)
**Purpose:** the web client of room sync: socket and clock, room state in React with rejoin after reload, and the start/join/room page.
**Side effects:** one WebSocket per joined room; `GET /rooms/mine` on sign-in; `POST /rooms` to start one.
**Before:** nothing, new.
**After:** a browser can start, join, follow and leave rooms.

**Function:** `syncToRoom()`, `runPendingRoomJump()`, `roomQueueTracks()` (new); `playQueue`, `jumpTo`, `next`, `previous`, `toggle`, `seek`, `resumePlayback`, `pausePlayback`, `cycleRepeat`, `toggleShuffle`, `checkBoundary`, `handleEnded`, `stopAndForget` (room branches): `frontend/src/components/PlayerBar.tsx`
**Date:** 2026-10-11
**How added:** new feature (room sync spec step 2)
**Purpose:** in a room the player follows the room's state with drift correction and a learned seek lead, and its controls send room commands.
**Side effects:** sends room commands and a drift report every 5 s; no crossfade or gapless scheduling while in a room.
**Before:** the player only played its own queue.
**After:** outside a room nothing changes; inside one, every control acts on the room.

**Function:** `broadcast()` (new `skip` parameter), `connect()`: `backend/src/services/rooms.ts`
**Date:** 2026-10-11
**How added:** bug fix
**Purpose:** a newcomer gets its `welcome` only, not a `state` of its own arrival first.
**Side effects:** none.
**Before:** the joining socket got `state` and then `welcome`.
**After:** only `welcome`; the others get `state`.

**Function:** `createRoomRegistry()` (new) and its methods `create`, `connect`, `disconnect`, `leave`, `command`, `status`, `snapshot`, `codeOfUser`, `overview`: `backend/src/services/rooms.ts`
**Date:** 2026-10-11
**How added:** new feature (roadmap box 22, room sync spec step 1)
**Purpose:** the room sync state machine: shared queue, playback anchor, server-side song timer, conflict rules for commands, membership, away grace and host handover.
**Side effects:** in-memory only; timers through the injected `setTimer`; sends to and closes the `Connection`s it is given.
**Before:** nothing, new function.
**After:** rooms exist on the server; tested with a fake clock in `services/rooms.test.ts`.

**Function:** `roomsRoute` (new: `POST /rooms`, `GET /rooms/mine`, `GET /rooms/:code`, `GET /admin/rooms`, WebSocket `GET /rooms/ws`), `memberFromToken()`, `memberInfo()`, `stillValid()`, exported `rooms` instance: `backend/src/routes/rooms.ts`; `buildApp()`: `backend/src/app.ts`
**Date:** 2026-10-11
**How added:** new feature (roadmap box 22)
**Purpose:** the HTTP and WebSocket surface of room sync; hello-message auth, ping/pong clock samples, command and status messages, heartbeat.
**Side effects:** reads `users` and track summaries; `buildApp()` now registers `@fastify/websocket` with a 64 KB message limit.
**Before:** no WebSocket support in the server.
**After:** clients can make, join and drive rooms; admins can list them.

**Function:** `UploadProvider`, `useUploads()` (new): `frontend/src/components/UploadProvider.tsx`; `UploadQueueList` (new): `UploadQueueList.tsx`; `UploadPage`, `ControlCenterPage`
**Date:** 2026-10-11
**How added:** new feature (owner request)
**Purpose:** uploads keep running on other pages and can be watched from the Control Center.
**Side effects:** a `beforeunload` listener while anything is queued or uploading; `uploadWithProgress()` and the queue logic moved from `UploadPage` into the provider unchanged.
**Before:** the queue lived in `UploadPage` state, so leaving the page dropped it from view and the Control Center knew nothing of uploads.
**After:** one queue for the whole tab, shown on the Upload page and in a Control Center Uploads section, with Clear finished and per-row Waiting/percentage.

**Function:** `POST /tracks/upload` handler: `backend/src/routes/tracks.ts`; `uploadWithProgress()`, `addFiles()`, `UploadPage`: `frontend/src/pages/UploadPage.tsx`
**Date:** 2026-10-11
**How added:** upload review follow-up (owner request)
**Purpose:** keep files with no audio out of the library, and make the web page take every type the server takes.
**Side effects:** an upload with no readable duration is refused with 400 and nothing is filed or left in staging.
**Before:** a text file named `.mp3` or `.wav` was filed as a track; the page silently dropped `.wav`, `.aac` and non-audio files; a non-JSON 413 read "Upload failed (413)".
**After:** such a file is refused; `.wav` and `.aac` upload from the page; skipped files are listed by name; a non-JSON 413 says the file is too large.

**Function:** `PlayButtons` (new), `StoragePanel(ui)` — `android/.../ui/downloads/DownloadsScreen.kt`
**Date:** 2026-10-11
**How added:** owner request
**Purpose:** a shorter storage panel; play actions in the corner like the library.
**Side effects:** none.
**Before:** Play all and Shuffle buttons inside the storage panel.
**After:** a small Play all and a round Shuffle floating at the bottom right.

**Function:** `loadGuest()`, `playPick()`, `guestPicks()`, `guestAlbumPicks()`, `GuestHome`, `AlbumPick` (all new) — `android/.../ui/profile/YouViewModel.kt`; `GuestHomeList`, `GuestCard`, `CoverRow` (new), `RecentRow` — `YouScreen.kt`
**Date:** 2026-10-11
**How added:** new feature (owner request)
**Purpose:** guests get something on Home besides a note.
**Side effects:** three guest-allowed requests when a guest opens Home or rerolls (`/browse/shuffled`, `/albums?limit=1`, `/artists?limit=1`).
**Before:** guest Home was the greeting, Shuffle and one line of text; `GuestNote` removed.
**After:** a card with the library's counts, then random songs and albums to try, rerolled by pull or New picks.

**Function:** `tilesFor(filter, query, sort)`, `songsFor()` (new), `searchWords()` (new), `DownloadSort` (new), `playSong(shown, ...)` — `android/.../ui/downloads/DownloadsViewModel.kt`; `SearchRow` (new), `NoMatches` (new), `songRows(songs)` — `DownloadsScreen.kt`
**Date:** 2026-10-11
**How added:** new feature (owner request)
**Purpose:** search and sort what's downloaded.
**Side effects:** none; search and sort live in the view model and reset when the screen is left for good.
**Before:** filter chips only, newest first; tapping a song queued every downloaded song.
**After:** search by name, artist or album, sort by recent, name or artist; tapping a song queues the songs shown.

**Function:** `HomeScreen` layout, `ShuffleLibraryButton` — `android/.../ui/profile/YouScreen.kt`
**Date:** 2026-10-11
**How added:** owner request
**Purpose:** card and library tiles first on Home; Shuffle as a small top bar button.
**Side effects:** none.
**Before:** full-width Shuffle, Recently played, tiles, range picker, card, top lists.
**After:** Shuffle in the top bar; card, tiles, range picker, Recently played, top lists.

**Function:** `mosaicCovers()` (new), `Stored.songCovers()`, `GroupPage.covers` — `android/.../ui/downloads/DownloadsViewModel.kt`, `DownloadGroupScreen.kt`; `CoverMosaic` — `DownloadsScreen.kt`
**Date:** 2026-10-11
**How added:** new feature (owner request)
**Purpose:** the Songs tile shows up to six album covers instead of one or four.
**Side effects:** none.
**Before:** one cover, or a 2×2 of the newest four songs' covers (repeats included).
**After:** 1 to 6 covers, one per album, newest first, in a layout chosen by count.

**Function:** `NothingDownloaded` (new), `HowToRow` (new) — `android/.../ui/downloads/DownloadsScreen.kt`; `LoadStateContent(empty)` — `android/.../ui/common/LoadStateContent.kt`
**Date:** 2026-10-11
**How added:** new feature (owner request)
**Purpose:** a real empty state for the Downloads tab.
**Side effects:** none.
**Before:** an empty Downloads tab showed one centred line of text.
**After:** an icon, title, why, how-to panel, Browse your library (hidden offline) and Download settings.

**Function:** `DownloadGroupScreen` song rows — `android/.../ui/downloads/DownloadGroupScreen.kt`
**Date:** 2026-10-11
**How added:** bug fix (owner report)
**Purpose:** show the album on the Songs and playlist download pages.
**Side effects:** none; covers come from files already on the phone.
**Before:** artist only, numbered rows everywhere.
**After:** "Artist · Album" except on album pages; the Songs page leads each row with its cover.

**Function:** `LibraryShuffle.start()` (new) — `android/.../playback/LibraryShuffle.kt`; `LibraryViewModel.shuffleAll()`, `YouViewModel.shuffleLibrary()` (new), `greeting()`, `ShuffleLibraryButton` (new), `LibraryBottomBar.navigateToTab()`, `StartViewModel` start route
**Date:** 2026-10-11
**How added:** new feature (A97, A98)
**Purpose:** the You tab becomes Home, the first tab and the navigation anchor, leading with Shuffle my library.
**Side effects:** none new; the shuffle calls `GET /browse/shuffled` as before.
**Before:** Library was the anchor and start screen; the library shuffle lived in `LibraryViewModel` and failed silently.
**After:** Home is the anchor and start screen; both screens use `LibraryShuffle`, which returns a line on failure.

**Function:** `getTrackDetailById()` — `backend/src/db/browse.ts`; `SongActionsViewModel.openArtist()` (new), `SongMenuSheet(onOpenArtist)` — `android/.../ui/profile/`; `PlaybackController.streamInfo()`, `StreamReadout`; `LibraryTiles` (new, replaces `LibraryRow`) — `YouScreen.kt`
**Date:** 2026-10-11
**How added:** new feature (A95, A96)
**Purpose:** Go to artist from the song sheet; "On this phone" in the player; Your library reachable at the top of You.
**Side effects:** one `GET /tracks/:id` per Go to artist tap.
**Before:** no artist row; the player showed buffer/network for downloaded songs; Your library sat at the bottom of You.
**After:** as in the 2026-10-11 "Player On this phone, Go to artist, Your library tiles" CHANGELOG entry.

**Function:** `CoverMosaic` (new), `DownloadRow.covers`, `DownloadSongRow.coverUri` — `android/.../ui/downloads/`; `DownloadRepository.downloadSong()`, `removeSong()`, `removeGroup()`, `songCoverUri()` (new) — `android/.../downloads/DownloadRepository.kt`; `SheetStatusBarFollowsApp()`, `LocalDarkTheme` (new) — `android/.../ui/theme/Theme.kt`
**Date:** 2026-10-11
**How added:** bug fix
**Purpose:** covers for songs downloaded one at a time; sheets that keep the app's status bar icon colour.
**Side effects:** writes and deletes cover files under `filesDir/download-covers/`.
**Before:** the "Songs" group and its songs had no cover; sheets took icon colour from the phone's dark setting.
**After:** each such song saves its own cover, shown as a mosaic on the tile and page; sheets follow the app's setting.

**Function:** `ThemeMode.isDark()` (new) — `android/.../ui/theme/Theme.kt`; `PageRow`, `Card`, `ColorThemeTile` — `android/.../ui/settings/SettingsScreen.kt`
**Date:** 2026-10-11
**How added:** refactor (A94)
**Purpose:** one rule for whether the app is dark; Settings back to the app's outlined style.
**Side effects:** none.
**Before:** the dark rule was copied in `MainActivity` and `SettingsPageScreen`; `PageRow`/`Card`/`ColorThemeTile` as in A92/A93.
**After:** both call `ThemeMode.isDark()`; the three composables are as before A92 (0c03a5e^).

**Function:** `YouViewModel.setRange()`, `switching` (new), `SongActionsViewModel.loadDetail()` — `android/.../ui/profile/`; `previousRanks()` — `backend/src/db/listeningStats.ts`
**Date:** 2026-10-11
**How added:** bug fix
**Purpose:** a range switch that keeps the page up; Details that lands in one update; a narrower previous-rank query.
**Side effects:** none.
**Before:** `setRange` reset the state to `Loading`; `loadDetail` set your numbers from a separate launch; `previousRanks` always `LEFT JOIN`ed artists.
**After:** `setRange` loads behind the shown content with `switching` set; `loadDetail` awaits both before updating; `previousRanks` takes `{ join, where }`.

**Function:** `Card`, `PageRow` — `android/.../ui/settings/SettingsScreen.kt`
**Date:** 2026-10-11
**How added:** bug fix (A93)
**Purpose:** keep borderless Settings cards visible in dark themes, and show the accent cursor on a tap.
**Side effects:** none.
**Before:** `Card` filled with `surfaceContainer` only; `PageRow` lit only while pressed, which a quick tap never showed.
**After:** `Card(darkTheme)` fills with `surfaceContainerHighest` in the dark and remaps the inner scheme to the ground;
`PageRow` holds the fill for `CursorFlashMs` before calling `onClick`.

**Function:** `LibraryRepository.queueItem(HistoryEntryDto)` (new) — `android/.../playback/QueueSource.kt`; `YouViewModel.playRecent()`, `shortPlaces()`, `SongActionsViewModel.loadDetail()` (changed)
**Date:** 2026-10-11
**How added:** bug fix (review of 500ce06)
**Purpose:** fixes from the You tab review: a stable recent-play tap, one history queue builder, short rank jumps, independent stats in Details.
**Side effects:** none.
**Before:** as built in 500ce06.
**After:** as in the 2026-10-11 "You tab upgrade: review fixes" CHANGELOG entry.

**Function:** `DownloadRepository.loaded` (now a `StateFlow`), `queueOf()` removed; `PlaybackController` downloads collector; `NetworkMonitor.usable()`; `AuthRepository.recheckWhenOnline()`; new `DownloadedTrack.toQueueItem()` — `android/.../downloads/DownloadDatabase.kt`; `DownloadsViewModel.retry()` / `remove()` removed
**Date:** 2026-10-11
**How added:** bug fix (offline downloads review round 2, D3, D5–D8)
**Purpose:** a reliable offline-start re-check, a network check that doesn't strand VPN users offline, a race-free login check, less code.
**Side effects:** none.
**Before:** see the CHANGELOG entry of the same name.
**After:** see the CHANGELOG entry of the same name.

**Function:** `readSpaceUsed()`, `refreshSpaceUsed()` (new) — `android/app/src/main/kotlin/com/brainlessmusic/app/downloads/DownloadRepository.kt`
**Date:** 2026-10-11
**How added:** bug fix (review C30)
**Purpose:** read the download cache's size off the main thread.
**Side effects:** updates `spaceUsed`.
**Before:** `cache.cacheSpace` on the main thread, blocking on the cache's start-up scan.
**After:** read on `Dispatchers.IO`.

**Function:** `PlaybackService.onCreate()`, `onTaskRemoved()`, `onDestroy()` — `android/app/src/main/kotlin/com/brainlessmusic/app/playback/PlaybackService.kt`
**Date:** 2026-10-11
**How added:** bug fix (review C31)
**Purpose:** no blocking read in `onCreate`, no leaked executor thread.
**Side effects:** shuts the bitmap executor down on destroy.
**Before:** `runBlocking` DataStore read in `onCreate`; a new executor per creation, never shut down.
**After:** the setting loads in the background (blocking only in an early swipe-away); one executor, shut down.

**Function:** `QueueSheet` drop handling — `android/app/src/main/kotlin/com/brainlessmusic/app/ui/playback/QueueSheet.kt`; `DownloadDao.removeFromGroup()`, `deleteGroup()` — `.../downloads/DownloadDatabase.kt`
**Date:** 2026-10-11
**How added:** bug fix / refactor (review C32, C33)
**Purpose:** resync queue rows after a no-op drop; one orphan-cleanup path.
**Side effects:** none new.
**Before:** a no-op drop left stale rows; `deleteGroup` duplicated `dropUnlinked`; `removeFromGroup` returned an unused Boolean.
**After:** rows resync; `dropUnlinked` is shared; `removeFromGroup` returns Unit; `groupsHolding` removed.

**Function:** `runMigrations()` — `backend/src/db/migrator.ts`
**Date:** 2026-10-11
**How added:** hardening (review C22)
**Purpose:** apply each migration all or nothing.
**Side effects:** schema changes, `schema_migrations` row, in one transaction.
**Before:** exec then record, with no transaction around them.
**After:** wrapped in `db.transaction`, unless the file opens its own; new `dir` option for tests.

**Function:** `moveToFreeName()`, `moveIfFree()` (replace `uniqueDestination()`, `moveFile()`, `pathExists()`) — `backend/src/services/trackFiling.ts`
**Date:** 2026-10-11
**How added:** bug fix (review C23)
**Purpose:** file an upload under the first free name without ever replacing a file.
**Side effects:** hard link (or exclusive copy) into the library, then unlinks the staged file.
**Before:** check for a free name, then `rename`, racing with a concurrent upload.
**After:** claiming the name fails with EEXIST if taken, and the next name is tried.

**Function:** `encodeToFile()` — `backend/src/services/streaming.ts`
**Date:** 2026-10-11
**How added:** hardening (review C24)
**Purpose:** stop a hung encode holding a transcode slot.
**Side effects:** kills ffmpeg with SIGKILL after 15 minutes.
**Before:** no timeout.
**After:** the encode fails and the slot is released.

**Function:** `/auth/register` handler — `backend/src/routes/auth.ts`
**Date:** 2026-10-11
**How added:** bug fix (review C25)
**Purpose:** make exactly one first account the admin.
**Side effects:** INSERT into `users`, `setAdmin`.
**Before:** bootstrap status read before the hash's await; two racers both became admin.
**After:** decided in one transaction after the await; the loser gets 401.

**Function:** `playerCheckedIn()`, `playerClosed()` (changed), `listenerKey()`, `sweepListeners()` (new) — `backend/src/services/streamMonitor.ts`
**Date:** 2026-10-11
**How added:** hardening (review C26)
**Purpose:** keep the live-listener map bounded.
**Side effects:** evicts stale or oldest entries.
**Before:** swept only when an admin listed listeners.
**After:** swept on each new key, capped at 200, keys cut to 200 User-Agent characters.

**Function:** `/tracks/upload` handler — `backend/src/routes/tracks.ts`; `downloadGuestCodeCard` — `frontend/src/lib/guestCodeCard.ts`
**Date:** 2026-10-11
**How added:** bug fix (review C27, C35)
**Purpose:** never leave a staging file behind; give the browser time to save the guest card.
**Side effects:** unlinks the staging path in `finally`; a delayed `revokeObjectURL`.
**Before:** some error paths left staging files; the object URL was revoked at once.
**After:** staging is always cleaned; the URL is revoked after a minute.

**Function:** `PendingPlays.scheduleRetry()` — `android/app/src/main/kotlin/com/brainlessmusic/app/playback/PendingPlays.kt`
**Date:** 2026-10-11
**How added:** bug fix (review C17)
**Purpose:** keep retrying unsent plays every 5 minutes while online.
**Side effects:** launches the retry job.
**Before:** called from the retry's own send, it saw itself as active and stopped the chain.
**After:** ignores its own job; now `suspend`.

**Function:** `DownloadRepository.roomFor()` (changed), token collector in `init` (new) — `android/app/src/main/kotlin/com/brainlessmusic/app/downloads/DownloadRepository.kt`; `TokenProvider.token` (new) — `.../data/remote/TokenProvider.kt`
**Date:** 2026-10-11
**How added:** bug fix (review C19, C20, C28)
**Purpose:** a storage check that counts the queue; resume a 401-paused queue on sign-in.
**Side effects:** keeps `reserved` sizes in memory; resumes the download service.
**Before:** queued bytes were ignored, lookups unbounded, and a 401 pause waited for a tap on Download.
**After:** sizes reserved until done, one check at a time, 4 lookups at once; a sign-in resumes the queue.

**Function:** `LibraryRepository.callApi()` — `android/app/src/main/kotlin/com/brainlessmusic/app/data/repository/LibraryRepository.kt`; `AuthRepository.restoreSession()` — `.../data/repository/AuthRepository.kt`
**Date:** 2026-10-11
**How added:** bug fix (review C21, C18)
**Purpose:** let cancellation through; send queued plays after an online restore.
**Side effects:** `restoreSession` starts a pending-play send.
**Before:** cancellation became a `ConnectionException`; an online restore left queued plays waiting.
**After:** cancellation propagates; a successful restore flushes.

**Function:** `load()`, `reconnect()`, `setDataSaver()`, `toggleShuffle()` — `frontend/src/components/PlayerBar.tsx`
**Date:** 2026-10-11
**How added:** bug fix (review C11-C14)
**Purpose:** let only the newest load act on the audio element and the queue.
**Side effects:** `load()` now aborts an in-progress data-saver swap and clears `swappingRef`.
**Before:** the failed-load skip used a stale queue; reconnect, data-saver swap and shuffle wrote after a newer song or queue had taken over.
**After:** each checks the load token (or queue identity) after every await and gives up if superseded.

**Function:** `TrackDetailDrawer` form fill effect — `frontend/src/components/TrackDetailDrawer.tsx`
**Date:** 2026-10-11
**How added:** bug fix (review C16)
**Purpose:** fill the tag form from the server once per track.
**Side effects:** none.
**Before:** every refetch overwrote the form, losing unsaved edits.
**After:** fills only when a new track's data first arrives.

**Function:** `recordScrobble()` — `backend/src/db/plays.ts`; scrobble route — `backend/src/routes/tracks.ts`
**Date:** 2026-10-11
**How added:** bug fix (review C10)
**Purpose:** count a play once however many times it is sent.
**Side effects:** INSERT into `play_history` (with `client_play_id`), `tracks.play_count` bump.
**Before:** a repeat was recognised only by an exact `played_at`, which clock skew and timeouts defeated.
**After:** a repeat `clientPlayId` returns the first play's id; with no id, the old `played_at` match applies.

**Function:** `PlaybackController.scrobble()`, `PendingPlays.add()`, `PendingPlays.send()`, `LibraryRepository.scrobble()`, `DownloadDatabase.MIGRATION_2_3` — `android/app/src/main/kotlin/com/brainlessmusic/app/`
**Date:** 2026-10-11
**How added:** bug fix (review C10)
**Purpose:** give each play one id and one time, kept through the offline queue.
**Side effects:** Room `downloads.db` version 3 (`pending_play.clientPlayId`).
**Before:** a queued play was dated when it was queued and carried no id.
**After:** the same `clientPlayId` and `playedAt` are used for the online send and any resend.

**Function:** `upsertTrack()`, `updateTrackFields()` — `backend/src/db/library.ts`
**Date:** 2026-10-11
**How added:** bug fix (review C9)
**Purpose:** stop a library scan undoing an admin's tag edit.
**Side effects:** `updateTrackFields` also writes `tags_edited_at`.
**Before:** every rescan overwrote title, artist, album and track number from the file.
**After:** a track with `tags_edited_at` set keeps those four; everything else still follows the file.

**Function:** `signToken()`, `signMediaToken()`, `verifySessionToken()`, `verifyMediaToken()` (changed), `userFrom()` (new) — `backend/src/services/token.ts`
**Date:** 2026-10-11
**How added:** hardening (review C8)
**Purpose:** carry the user's session version in every token.
**Side effects:** none.
**Before:** tokens carried only id and username.
**After:** they also carry `sv`; verifying returns `sessionVersion` (0 when absent).

**Function:** `rejectStaleSession()` (replaces `rejectDeletedUser()`) — `backend/src/plugins/auth.ts`
**Date:** 2026-10-11
**How added:** hardening (review C8)
**Purpose:** refuse a token whose user is gone or whose password has changed since it was signed.
**Side effects:** one user lookup per authenticated request (as before).
**Before:** refused only deleted users.
**After:** also refuses a session version mismatch.

**Function:** `setPasswordHash()`, `setPasswordHashById()` — `backend/src/db/users.ts`; `tokenUserOf()` (new) — `backend/src/routes/auth.ts`
**Date:** 2026-10-11
**How added:** hardening (review C8)
**Purpose:** bump `session_version` with every password change; sign tokens with the current version.
**Side effects:** UPDATE on `users`.
**Before:** a password change left existing tokens valid.
**After:** every older token is refused.

**Function:** `onSessionRefused()` (new), `request()`, `getMediaToken()` (changed) — `frontend/src/lib/apiClient.ts`
**Date:** 2026-10-11
**How added:** bug fix (review C7, C34)
**Purpose:** tell the app when the server refuses the session it holds; store a media token only under its own session.
**Side effects:** clears the stored token on a 401 that carried it, then calls listeners.
**Before:** any 401 cleared the token silently; a media token was filed under whichever session existed when it arrived.
**After:** listeners run (AuthProvider signs out); a media token for a replaced session is used once and not stored.

**Function:** `AuthProvider` (changed) — `frontend/src/auth/AuthContext.tsx`
**Date:** 2026-10-11
**How added:** bug fix (review C7, C15)
**Purpose:** sign out on a refused session; clear the query cache on every change of user.
**Side effects:** `queryClient.clear()`.
**Before:** the user stayed set after a 401; the cache outlived logout; a start-up network error cleared the token.
**After:** a refused session shows the login screen; the cache is cleared on sign-in, logout and refusal; a network error keeps the token.

**Function:** `TokenProvider.reportRefused()` / `refused` (new), `AuthInterceptor.intercept()` (changed) — `android/app/src/main/kotlin/com/brainlessmusic/app/data/remote/`
**Date:** 2026-10-11
**How added:** bug fix (review C7)
**Purpose:** report a 401 from any request carrying the session token.
**Side effects:** emits on a shared flow.
**Before:** only `/auth/me` at start-up noticed a 401.
**After:** every request does.

**Function:** `AuthRepository.needsSignIn` (new), `endRefusedSession()` (changed) — `android/app/src/main/kotlin/com/brainlessmusic/app/data/repository/AuthRepository.kt`
**Date:** 2026-10-11
**How added:** bug fix (review C7)
**Purpose:** end the session when any request is refused, and tell the UI.
**Side effects:** as `endRefusedSession` (clears token, queued plays, credentials).
**Before:** a 401 mid-use left the app signed in with every call failing.
**After:** `needsSignIn` turns true until the next sign-in.

**Function:** `BrainlessNavGraph()` (changed) — `android/app/src/main/kotlin/com/brainlessmusic/app/ui/navigation/BrainlessNavGraph.kt`
**Date:** 2026-10-11
**How added:** bug fix (review C7)
**Purpose:** hold the graph on the splash until the session is restored; go to Login when it is refused.
**Side effects:** navigation.
**Before:** a back stack restored after process death loaded before the token was set; a refusal left the user in place.
**After:** both go through sign-in.

**Function:** `endRefusedSession()` (new) — `android/app/src/main/kotlin/com/brainlessmusic/app/data/repository/AuthRepository.kt`
**Date:** 2026-10-11
**How added:** bug fix (review C5)
**Purpose:** sign out locally after a 401, and drop the refused account's queued plays.
**Side effects:** clears the token, media URL, pending plays table and stored credentials.
**Before:** the two 401 paths cleared credentials but kept the queued plays.
**After:** both paths call it.

**Function:** `PendingPlays.forget()` (new), `PendingPlays.send()` (changed) — `android/app/src/main/kotlin/com/brainlessmusic/app/playback/PendingPlays.kt`
**Date:** 2026-10-11
**How added:** bug fix (review C5, C29)
**Purpose:** forget queued plays without trying to send them; stop a send when the session changes under it.
**Side effects:** deletes all pending play rows, cancels the retry.
**Before:** only `sendThenClear()` cleared rows, and a send in progress kept going after the token changed.
**After:** `sendThenClear()` ends with `forget()`; `send()` re-checks the token before each row.

**Function:** `PlaybackController` listener `onPlayerError()` (changed) — `android/app/src/main/kotlin/com/brainlessmusic/app/playback/PlaybackController.kt`
**Date:** 2026-10-11
**How added:** bug fix (review C6)
**Purpose:** skip a bad song, but stop after a run of failures.
**Side effects:** seeks the player or sets the error message.
**Before:** skipped whenever a next song existed, forever with repeat-all.
**After:** gives up after `MAX_FAILED_IN_A_ROW` (5) failures in a row, or the queue length if shorter; `failedInARow` resets on play or a new queue.

**Function:** `loginLimitFor()`, `countLoginFailure()`, `tooManyTries()` (new); `/auth/login`, `/auth/passcode-login` handlers (changed) — `backend/src/routes/auth.ts`
**Date:** 2026-10-11
**How added:** hardening (review C1)
**Purpose:** sign-in rate limits that count failures only, per IP and per username across all IPs.
**Side effects:** in-memory limiter windows.
**Before:** every attempt counted per IP, and a correct sign-in cleared that IP's window.
**After:** successes are free and never clear anything; failures also count toward `accountLoginFailuresPerHour` for the username.

**Function:** `RateLimiter.peek()` (new, replaces `clear()`) — `backend/src/services/rateLimit.ts`
**Date:** 2026-10-11
**How added:** hardening (review C1)
**Purpose:** say whether a key is over its limit without counting a hit.
**Side effects:** none.
**Before:** `clear(key)` forgot a key's window.
**After:** no way to clear a window; `peek` checks it.

**Function:** `isAdminRequest()` — `backend/src/utils/isAdmin.ts`
**Date:** 2026-10-11
**How added:** hardening (review C2)
**Purpose:** re-read the caller's admin flag, for open routes that show admins more.
**Side effects:** one user lookup.
**Before:** nothing — new function (inline in `GET /tracks`).
**After:** used by `GET /tracks`, `/tracks/:id`, `/tracks/:id/stream`, `/albums/:id`, `/search`.

**Function:** `searchLibrary()`, `getAlbumDetail()` (changed), `hiddenTrackClause()` (new) — `backend/src/db/browse.ts`; `listTopTracks()`, `countTopTracks()` — `backend/src/db/plays.ts`
**Date:** 2026-10-11
**How added:** hardening (review C2, A34)
**Purpose:** leave hidden tracks out of search and album pages unless the caller is an admin; out of top tracks always.
**Side effects:** none.
**Before:** hidden tracks appeared to everyone.
**After:** `includeHidden` (default false) controls them.

**Function:** `peaksForTrack()` (changed), `withDecodeSlot()` (new) — `backend/src/services/waveform.ts`
**Date:** 2026-10-11
**How added:** hardening (review C3)
**Purpose:** bound concurrent ffmpeg waveform decodes.
**Side effects:** spawns ffmpeg (at most 2 at once).
**Before:** one decode per distinct track id, unbounded; failures retried every request.
**After:** 2 active, 16 waiting, otherwise `'busy'` (503); failures remembered 10 minutes.

**Function:** `recordPlaybackFailure()` (changed) — `backend/src/db/playbackFailures.ts`
**Date:** 2026-10-11
**How added:** hardening (review C4)
**Purpose:** store a playback failure without letting the table grow without bound.
**Side effects:** INSERT, then DELETE of rows past the newest 1000.
**Before:** stored any length, kept forever.
**After:** text clipped (500 / 200 chars), 1000 rows kept; the route also limits 30 reports per user per minute.

**Function:** `MainActivity.onWindowFocusChanged()` (new) — `android/app/src/main/kotlin/com/brainlessmusic/app/MainActivity.kt`
**Date:** 2026-10-11
**How added:** bug fix (black system bars after opening from the media notification)
**Purpose:** count focus gains so the edge-to-edge effect runs again after the system restores the theme's bar colours.
**Side effects:** re-runs `enableEdgeToEdge` on every focus gain (cheap).
**Before:** edge-to-edge re-applied only on a light/dark change or the splash's exit callback.
**After:** also re-applied whenever the window regains focus.

**Function:** `getUserStats()` (changed), `previousRanks()`, `previousSinceFor()` (new) — `backend/src/db/listeningStats.ts`
**Date:** 2026-10-11
**How added:** new feature (A91)
**Purpose:** compare a stats range with the window just before it: `previousTotals` and per-song / per-artist `previousRank`.
**Side effects:** none (reads only).
**Before:** totals and top lists for the range only.
**After:** week, month and year also return the previous window's totals and each top entry's previous rank; all time returns `previousTotals: null`.

**Function:** `listHistoryForUser()` — `backend/src/db/plays.ts`
**Date:** 2026-10-11
**How added:** new feature (A91)
**Purpose:** history rows for the You tab's Recently played.
**Side effects:** none.
**Before:** no album id and no missing-file flag.
**After:** each row carries `albumId` and `missing` (boolean).

**Function:** `YouScreen` (reworked: `PlayerCard`, `BigStat`, `RecentRow`, `TopSongHero`, `MovementTag`, `RankedRow`), `movement()`, `Movement` — `android/.../ui/profile/YouScreen.kt`; `listenedHeadline()`, `listenedDelta()` — `ProfileFormat.kt`; `YouViewModel.recent`, `playAllTop()`, `playRecent()`, `queueItem()`; `ProfileRepository.trackStat()`, `recentlyPlayed()`
**Date:** 2026-10-11
**How added:** new feature (A91)
**Purpose:** the You tab as a player profile: card header, recently played, Play / Shuffle, #1 large, rank changes, song menu.
**Side effects:** two more requests when the tab loads, refreshes or resumes (`GET /me/history?limit=60`).
**Before:** letter avatar and three stat boxes, top songs and artists as plain rows, tap only.
**After:** as in the 2026-10-11 "You tab upgrade" CHANGELOG entry.

**Function:** `SongActionsViewModel.loadDetail()` (changed), `myStat`; `myRows()` — `android/.../ui/profile/SongActions.kt`, `SongMenu.kt`
**Date:** 2026-10-11
**How added:** new feature (A91)
**Purpose:** your own numbers for a song in the song menu's Details.
**Side effects:** one `GET /me/stats/tracks/:id` per Details open, accounts only.
**Before:** Details showed the file's tags and everyone's play count.
**After:** adds Your plays, You listened, First played and You last played (or "Not played yet").

**Function:** `PageRow`, `Card`, `ColorThemeTile` — `android/.../ui/settings/SettingsScreen.kt`
**Date:** 2026-10-11
**How added:** refactor (A92)
**Purpose:** Settings without borders: an arcade options menu on the main page, filled cards on the sub-pages.
**Side effects:** none.
**Before:** icon, name and summary rows in an outlined card; outlined cards and tiles below.
**After:** as in the 2026-10-11 "Settings without borders" CHANGELOG entry.

**Function:** `DownloadsScreen` (rewritten: `StoragePanel`, `InProgressPanel`, `FilterRow`, `DownloadTile`, `StateBadge`, `SongRow`, `RemoveGroupDialog`), `DownloadsViewModel` (rewritten: `ui`, `playAll()`, `playSong()`, `pauseAll()`, `resumeAll()`, `tilesFor()`), new `DownloadGroupScreen` / `DownloadGroupViewModel` — `android/.../ui/downloads/`; `DownloadRepository.paused`, `pauseAll()`, `resumeAll()`, `downloadAgain()`; `DownloadDao.allTracks()`, `groupFlow()`, `tracksOfFlow()`; `Routes.DOWNLOAD_GROUP`
**Date:** 2026-10-11
**How added:** new feature (A89, A90)
**Purpose:** the Downloads tab as a cover grid with storage, Play all, in-progress, filters, and a page per group.
**Side effects:** none beyond the download service (pause and resume all).
**Before:** a plain list with a space line, play on tap and a remove menu.
**After:** as in the 2026-10-11 cover grid CHANGELOG entry.

**Function:** `PlaybackController.rebuildQueuedItems()` (new, from `applyDataSaver()`), `streamUrlFor()`, `skipToDownloaded()`, `scrobble()`, `reportListened()`; `DownloadRepository.isLoaded`, `readIndex()`, `queueOf()`; `PendingPlays` (`close()`, `sendThenClear()`, retry timer, `isRefusedForGood()` narrowed); `AuthRepository.logout()`, new `recheckWhenOnline()`; `NetworkMonitor` (validated networks only); `recordScrobble()` (dedupe) — `backend/src/db/plays.ts`; `SearchPage` placeholder
**Date:** 2026-10-11
**How added:** bug fix (review of the offline downloads work)
**Purpose:** the 13 findings in the 2026-10-11 "Fixes from reviewing the offline downloads work" CHANGELOG entry.
**Side effects:** logout clears `pending_play`; waiting plays retried every 5 minutes while online.
**Before:** see that entry.
**After:** see that entry.

**Function:** `recordScrobble()` (new `playedAt` parameter) — `backend/src/db/plays.ts`; scrobble route and new `parsePlayedAt()` — `backend/src/routes/tracks.ts`
**Date:** 2026-10-11
**How added:** new feature (A87)
**Purpose:** date a play made offline by when it happened.
**Side effects:** DB writes to `play_history` and `tracks`, as before.
**Before:** every play was dated to when it reached the server, and `last_played_at` was always set to now.
**After:** an optional `playedAt` within 30 days dates the play; `last_played_at` only ever moves forward.

**Function:** new `PendingPlays` (`add()`, `setMsPlayed()`, `flush()`), `PlayRef`, `isRefusedForGood()` — `android/.../playback/PendingPlays.kt`; new `PendingPlay`, `PendingPlayDao`, `DownloadDatabase.MIGRATION_1_2`; `PlaybackController.scrobble()`, `reportListened()`; `LibraryRepository.scrobble()` (new `playedAt`)
**Date:** 2026-10-11
**How added:** new feature (A87; offline downloads, step 5)
**Purpose:** keep plays made with no signal and send them later with their time.
**Side effects:** writes the `pending_play` table; scrobble calls when the phone comes back online.
**Before:** a scrobble with no signal was lost.
**After:** it waits on the phone and is sent, oldest first, when the signal returns.

**Function:** `DownloadRepository` new `downloadPlaylist()`, `downloadSong()`, `removeSong()`, `deleteAll()`, `roomFor()`, `needsSignIn`, shared `downloadGroup()` (`downloadAlbum()` now takes `onRefused`); `DownloadDao` new `addToGroup()`, `removeFromGroup()`, `deleteAll()`, `saveGroup()` returns dropped songs; `PlaybackSettings.downloadLimitGb` / `setDownloadLimitGb()`
**Date:** 2026-10-11
**How added:** new feature (offline downloads, step 4)
**Purpose:** playlist and single-song downloads, the storage limit (A88), and pausing on an expired session.
**Side effects:** `GET /tracks/:id` per song not yet downloaded when a limit is set; DataStore key `download_limit_gb`; deletes files and `download-covers` on Delete all.
**Before:** albums only, no limit, a 401 failed each song separately.
**After:** as in the 2026-10-11 step 4 CHANGELOG entry.

**Function:** new `PlaybackController.skipToDownloaded()` (called from `onMediaItemTransition()` and `onPlayerError()`); new `DownloadButton` — `android/.../ui/downloads/DownloadButton.kt`; new `DownloadSettings`, `DownloadSettingsViewModel`, `downloadSummary()` — `android/.../ui/downloads/DownloadSettings.kt`; `PlaylistDetailViewModel` (`download`, `download()`, `removeDownload()`); `SongActionsViewModel` (`downloadStates`, `download()`, `removeDownload()`); `SongMenuSheet`; `SettingsPage.DOWNLOADS`
**Date:** 2026-10-11
**How added:** new feature (offline downloads, step 4)
**Purpose:** with no signal, play only what is on the phone; download buttons for playlists and songs; the Downloads settings page.
**Side effects:** none beyond the repository's.
**Before:** offline, each song not downloaded failed in turn; no playlist or song downloads; no download settings.
**After:** as in the 2026-10-11 step 4 CHANGELOG entry.

**Function:** new `DownloadDatabase`, `DownloadDao` (`saveGroup()`, `deleteGroup()`, `tracksOf()`, `groups()`, `groupTracks()`), `groupDownload()` — `android/.../downloads/`; `DownloadRepository` new `downloadAlbum()`, `removeGroup()`, `queueOf()`, `saveCover()`, `spaceUsed`; new `NetworkMonitor` — `android/.../data/remote/NetworkMonitor.kt`
**Date:** 2026-10-11
**How added:** new feature (offline downloads, step 3)
**Purpose:** remember what is downloaded so it can be listed and played with no signal; keep shared songs when a group is removed.
**Side effects:** writes `downloads.db` and cover files under `filesDir/download-covers`; fetches the album cover once per download.
**Before:** step 2 kept only Media3's per-song state; removing an album removed all its songs.
**After:** albums are groups with saved names and covers; removal deletes only songs no other group holds.

**Function:** new `DownloadsScreen`, `DownloadsViewModel` — `android/.../ui/downloads/`; `AppBottomBar` (offline banner, new `ConnectivityViewModel`); `LibraryBottomBar` (Downloads tab); `StartViewModel`; splash routing in `BrainlessNavGraph`; `PlaybackService` bitmap loader
**Date:** 2026-10-11
**How added:** new feature (offline downloads, step 3)
**Purpose:** a Downloads tab that works with no signal, an offline banner, and an offline start that opens on downloads.
**Side effects:** none.
**Before:** no way to see downloads; an offline start opened Library, which could only show an error.
**After:** as in the 2026-10-11 step 3 CHANGELOG entry.

**Function:** new `DownloadModule` (`provideDownloadCache()`, `provideDownloadManager()`) — `android/.../di/DownloadModule.kt`; new `MusicDownloadService`, `DownloadRepository` (`download()`, `remove()`, `isDownloaded()`), `TrackCacheKey` / `trackCacheKey()`, `downloadId()`, `trackIdOf()` — `android/.../downloads/`
**Date:** 2026-10-11
**How added:** new feature (offline downloads, step 2)
**Purpose:** download songs at original quality and keep their state for the screens and the player.
**Side effects:** writes song files under the app's `filesDir/downloads`; a Media3 download database; a foreground service with a notification; network requests to `GET /tracks/:id/stream`.
**Before:** nothing — new functions.
**After:** an album can be downloaded and its state follows each song.

**Function:** `PlaybackController` (new `dataSourceFactory`, `newExoPlayer()`, `toMediaItem()`); `AlbumDetailViewModel` (new `download`, `download()`, `removeDownload()`, `albumDownload()`); `AlbumDetailScreen` (new `DownloadButton`, `RemoveDownloadDialog`; `PlayShuffleRow` takes a `trailing` slot)
**Date:** 2026-10-11
**How added:** new feature (offline downloads, step 2)
**Purpose:** play downloaded songs from the phone; the album page's download button.
**Side effects:** none beyond the download service.
**Before:** the player always streamed; data saver applied to every queued song.
**After:** downloaded songs are read from the phone at original quality, data saver or not.

**Function:** `AuthRepository.restoreSession()`, `AuthRepository.login()`, `AuthRepository.adopt()`; `SessionStore.saveSession()` (new `isGuest` parameter), new `SessionStore.readIsGuest()`, `saveIsGuest()` — `android/.../data/`
**Date:** 2026-10-11
**How added:** bug fix (offline downloads spec, step 1)
**Purpose:** a cold start with no network keeps the stored session instead of signing out.
**Side effects:** DataStore key `is_guest` written on every sign-in and online restore; removed by `clearCredentials()`.
**Before:** any `/auth/me` failure cleared the credentials and sent the phone to login.
**After:** only a 401 does; otherwise `Restored(name, offline = true)` with the guest flag read from storage (unknown counts as guest).

**Function:** `SearchViewModel.runSearch()`, new `hasResults()` — `android/.../ui/search/SearchViewModel.kt`; `SearchPage` — `frontend/src/pages/SearchPage.tsx`; subtitles in `AlbumsPage`, `ArtistsPage`, `PlaylistsPage`, `FavoritesPage`
**Date:** 2026-10-11
**How added:** bug fix (A83, A84)
**Purpose:** keep the last search results up while a new search loads; stop screen readers hearing "Loading" twice.
**Side effects:** none.
**Before:** each new search blanked the results and showed the skeleton; the web lists said "Loading…" beside the skeleton's own label.
**After:** old results stay until new ones land (skeleton only when there were none); the subtitle is blank while loading.

**Function:** `PlaybackController.applyDataSaver()`; `SongActionsViewModel.playNext()` (now returns the line to show), `loadDetail()`; `formatDay()` — `android/.../ui/profile/ProfileFormat.kt`; the queue drag handle in `QueueSheet`
**Date:** 2026-10-11
**How added:** bug fix (review of the song menu / swipes / data saver change)
**Purpose:** don't build the player at launch for data saver with nothing queued; say "Playing" when Play next starts an empty queue; drop a stale details answer; show details dates in the phone's time zone; give the drag handle its touch area.
**Side effects:** none.
**Before:** the player could be built at launch; "plays next" for a song that started at once; a slow details answer could replace a newer one; UTC dates; padding inside the handle.
**After:** as in the 2026-10-11 "fixes from reviewing" CHANGELOG entry.

**Function:** new `PlayShuffleRow` — `android/.../ui/albums/AlbumDetailScreen.kt`; new `AlbumDetailViewModel.shuffle()`; new `ArtistDetailViewModel.playAll()` (now injects `PlaybackController`); `ArtistDetailScreen`; `PlaylistDetailViewModel.play()`
**Date:** 2026-10-11
**How added:** bug fix
**Purpose:** Play and Shuffle buttons on album and artist pages (review T1); shuffle buttons start from a random song.
**Side effects:** the artist buttons call `GET /albums/:id` once per album.
**Before:** albums and artists had no shuffle entry; a playlist's Shuffle always opened on its first song.
**After:** both pages have the playlist's two buttons; Shuffle turns shuffle on in the last mode from a random song.

**Function:** `PlaybackSettings.setShuffleMode()`, `PlaybackSettings.lastShuffleMode` — `android/.../data/local/PlaybackSettings.kt`
**Date:** 2026-10-11
**How added:** bug fix
**Purpose:** keep the mode an install from before v0.3.15 was in when the first tap turns shuffle off (review T2).
**Side effects:** writes `last_shuffle_mode` from `shuffle_mode` once, when it is missing.
**Before:** a missing `last_shuffle_mode` read as Shuffle, so Rediscover or Albums was lost on the first tap.
**After:** the old `shuffle_mode` stands in and is saved before it is overwritten.

**Function:** new `shuffleModeForPlay()` — `android/.../playback/PlaybackController.kt`
**Date:** 2026-10-11
**How added:** refactor
**Purpose:** the mode a new queue plays in, pulled out of `playQueue` so the rules are unit tested (review T5).
**Side effects:** none.
**Before:** inline `when` in `playQueue`, using `libraryShuffleMode()`.
**After:** same rules, as a pure function.

**Function:** new `SongMenuSheet`, `SongDetailsDialog` — `android/.../ui/profile/SongMenu.kt`; `SongActionsViewModel` gains `playNext()`, `playLessOften()`, `detail` / `loadDetail()`; new `ApiService.trackDetail()`, `LibraryRepository.getTrackDetail()`, `TrackDetailDto`; `LibraryScreen` `SongRow` / `SongsTab`; `LibraryViewModel.queueItem()`; `NowPlayingScreen` (new `onOpenAlbum`); `AlbumDetailScreen` `TrackRow` and new `AlbumDetailViewModel.queueItem()` (its `playNext()` removed); `PlaylistDetailScreen` (new `onOpenAlbum`), `PlaylistRow`, `PlaylistDetailViewModel.queueItem()` now public; `SearchScreen` `TrackResultRow`, new `SearchViewModel.queueItem()`
**Date:** 2026-10-11
**How added:** new feature
**Purpose:** a long press on a song (Library, album, playlist, search) or on the player's cover opens a song menu: play next, like, add to playlist, go to album, play less often, details (`GET /tracks/:id`).
**Side effects:** play less often calls `PUT /tracks/:id/less-often`, the same mark as a right swipe in the queue.
**Before:** a long press did nothing.
**After:** as above; guests see only play next, go to album and details.

**Function:** new `Modifier.swipeToSkip()`, `Modifier.verticalSwipe()` — `android/.../ui/playback/SwipeGestures.kt`; new `PlaybackController.skipToPreviousTrack()`, `PlaybackViewModel.previousTrack()`; `MiniPlayer`, `NowPlayingScreen`
**Date:** 2026-10-11
**How added:** new feature
**Purpose:** swipe the mini player or the player's cover left/right to skip, the mini player up to open the player, the player down to close it.
**Side effects:** none beyond the skips; a swipe back always changes song (no restart-after-3-seconds rule).
**Before:** only the buttons skipped; the player closed only from its arrow or back.
**After:** as above.

**Function:** `QueueSheet` header, `QueueRowItem` — `android/.../ui/playback/QueueSheet.kt`
**Date:** 2026-10-11
**How added:** layout change
**Purpose:** the header is one line (Queue left, count and mode right); rows sit on the player's 24 dp sides with 12 dp inside, in smaller text.
**Side effects:** none.
**Before:** a centred two-line header; rows inset 8 dp with ListItem's 16 dp and its larger text.
**After:** as above.

**Function:** new `PlaybackSettings.dataSaver` / `setDataSaver()`; new `PlaybackController.applyDataSaver()`, `toMediaItem()`, `streamInfo()`; `LibraryRepository.streamUrl()` (new `dataSaver` parameter); `StreamInfo.dataSaver`; `SettingsViewModel.dataSaver` / `setDataSaver()`; the "Data saver" row in `SettingsScreen`; `PlaybackViewModel.dataSaver` / `setDataSaver()` and the Now Playing top-bar icon
**Date:** 2026-10-11
**How added:** new feature
**Purpose:** Settings → Playback → Data saver streams the server's 64 kbps copy (`?quality=low`).
**Side effects:** DataStore key `data_saver`; toggling replaces every queued media item but the playing one, then restores the shuffle order.
**Before:** Android always streamed the original file.
**After:** as above; the stream readout leads with "Data saver" and names the decoded codec for such a track.

**Function:** `PlaybackController.libraryShuffleMode()`, `playQueue()`, `setShuffleMode()` — `android/.../playback/PlaybackController.kt`; new `PlaybackSettings.lastShuffleMode`, `setShuffleMode()`
**Date:** 2026-10-12
**How added:** new feature
**Purpose:** the shuffle buttons turn shuffle back on in the last mode it was on in (A82).
**Side effects:** DataStore key `last_shuffle_mode`, written with every non-off mode.
**Before:** with shuffle off, the shuffle buttons always used plain Shuffle.
**After:** they use the last mode shuffle was on in.

**Function:** `PlaybackController.playQueue()`, new `shufflesOnTap()`, `playNext()`, `restore()` — `android/.../playback/PlaybackController.kt`; new `PlaybackSettings.keepShuffle` / `setKeepShuffle()`; `SettingsViewModel.keepShuffle` / `setKeepShuffle()`; the "Keep shuffle" row in `SettingsScreen`; `LibraryViewModel.playSongsFrom()`
**Date:** 2026-10-11
**How added:** new feature
**Purpose:** a tapped song turns shuffle off unless "Keep shuffle" is on (YouTube Music behaviour).
**Side effects:** DataStore key `keep_shuffle`; a tap with the setting off saves shuffle mode OFF.
**Before:** a tapped song kept whatever shuffle was on.
**After:** as described in the 2026-10-11 "tapping a song turns shuffle off" CHANGELOG entry.

**Function:** new `AuthRepository.setColorTheme()`, `syncTheme()`; `login()`, `adopt()`, `restoreSession()` — `android/.../data/repository/AuthRepository.kt`; `ColorTheme.webId`, new `ColorTheme.fromWebId()`, `AppearanceSettings.storedColorTheme()` — `data/local/AppearanceSettings.kt`; `ApiService.setTheme()`, `MeResponse.theme`, new `ThemeRequest`; `SettingsViewModel.setColorTheme()`; `GuestCodesPanel` used list
**Date:** 2026-10-11
**How added:** new feature
**Purpose:** Android colour theme follows the profile (A78); G2 note on used codes.
**Side effects:** every way in may write the phone's theme setting; a profile with no theme gets one `PUT /me/theme` from the phone; release APK file name changes to `brainlessmusic-release.apk`.
**Before:** the Android colour was per phone only.
**After:** the six web themes sync both ways through the profile; Material You stays on the phone.

**Function:** `listFavoritesForUser()` — `backend/src/db/favorites.ts`; `getPlaylistDetail()` — `db/playlists.ts`; new `deleteTrackRowsOfRoot()`, `deleteTrackRow()` — `db/library.ts`; `deleteLibraryRoot()` — `db/libraryRoots.ts`; `deleteTrackAndFile()` — `routes/tracks.ts`; `PATCH /me/history/:id` — `routes/history.ts`; new `isInside()` — `utils/paths.ts`; `jumpTo()`, `resumePlayback()`, `pausePlayback()`, `stop()`, `load()`, `startNext()`, `checkBoundary()`, `handleEnded()`, the preload effect and mount cleanup — `frontend/src/components/PlayerBar.tsx`; `isNextOnAlbum()` — `frontend/src/lib/transitions.ts` and `android/.../data/local/TransitionPrefs.kt`; `formatBytes()`, `formatTotalLength()` — `frontend/src/lib/format.ts`; bulk mutations — `LibraryFull.tsx`; `chooseTheme()`, `invalidate()` — `OptionsPage.tsx`; `LibraryStatsLine`; the scan-end effect in `LibraryPage.tsx`; `GuestCodesPanel` used list; Android `PlaybackController` (`sessionPlayer` overrides, `playWithFade()`, `pauseWithFade()`, `skipWithFade()`, new `runPendingJump()`, `setShuffleMode()`, `setShuffleFromSession()`, `needsLibraryResource()`, `maybeRefill()`, `nextChunk(current)`, new `stopAndFlush()`, listener `onPlayWhenReadyChanged`/`onPlaybackSuppressionReasonChanged`); `PlaybackService.onCreate()`; `ProfileRepository.setLiked()`, `loadLikedIds()`; `SongActionsViewModel.toggleLike()`; `PlaylistDetailViewModel` edits; `PlaylistsViewModel.create()`; `YouViewModel.load()`, `refresh()`, new `onResume()`; `SettingsViewModel.logout()`; `LibraryViewModel.shuffleAll()`, `playSongsFrom()`; `AlbumDetailViewModel.refresh()`, `ArtistDetailViewModel.refresh()`; `PagedContent`; `SplashScreen`; `QueueSheet` subtitle; `PlaybackUiState.fromLibrary`
**Date:** 2026-10-11
**How added:** bug fix
**Purpose:** the second pass over the 2026-10-11 review findings.
**Side effects:** removing a folder now runs set-based deletes; a track delete refuses files outside every root; Android logout waits up to 3 s for one PATCH; the playback service reads one DataStore value synchronously at start.
**Before:** see each item in the 2026-10-11 "Review fixes, second pass" CHANGELOG entry.
**After:** as described in that entry.

**Function:** `POST /library/roots`, `DELETE /library/roots/:id`, new `overlaps()` — `backend/src/routes/library.ts`; `collectGuestCodeRequest()` — `backend/src/db/guestCodeRequests.ts`; `POST /auth/guest/requests/:id/collect` — `backend/src/routes/auth.ts`; `GET /browse/shuffled` — `backend/src/routes/shuffledTracks.ts`; new `clearTheme()` — `frontend/src/lib/theme.ts`; `logout()` — `frontend/src/auth/AuthContext.tsx`; the request poll in `AccountSelectPage.tsx`; `librarySource()`, `nextChunk()`, `restore()` — `android/.../playback/PlaybackController.kt`; `QueueSource.Shuffled.albumRest`, new `AlbumRest`, `LibraryRepository.queueItem(album, track)` (moved from `AlbumDetailViewModel`) — `playback/QueueSource.kt`; `LibraryViewModel.songs`, `playSongsFrom(index, row)`, new `SongListRow` — `ui/library/LibraryViewModel.kt`; `QueueSheet` snackbar
**Date:** 2026-10-11
**How added:** bug fix
**Purpose:** fixes R1, R2, R5, G1, S1, S2, F1 and P1-P3 from the 2026-10-11 reviews.
**Side effects:** migration `0023` adds `guest_code_requests.collected_at`; logout removes `brainlessmusic.theme` from localStorage; Android makes one `GET /albums/:id` when an Albums-mode library queue starts from a song.
**Before:** see each item in the 2026-10-11 "Review fixes" CHANGELOG entry.
**After:** as described in that entry.

**Function:** `GET /browse/shuffled` (`mode`, `asOf`) — `backend/src/routes/shuffledTracks.ts`; `seededWeightedOrder()`, `rediscoverWeight()`, `seededAlbumOrder()` — `backend/src/services/shuffle.ts`; `listPlayableAlbumPlaces()`, `lastPlayedByUser()` — `backend/src/db/shuffledTracks.ts`; `ShuffleMode`, `AlbumShuffle.order()` — `android/.../playback/`; `PlaybackController.cycleShuffle()` (was `toggleShuffle()`), `applyShuffleOrder()` (was `applySmartShuffle()`), `libraryShuffleMode()`, `appendItems()`, `playQueue()`; `QueueSource.Shuffled` (`mode`, `asOf`, `fresh()`); `PlaybackSettings.shuffleMode`; `LibraryViewModel.shuffleAll()`; the Now Playing shuffle button and queue sheet subtitle
**Date:** 2026-10-11
**How added:** new feature
**Purpose:** two more shuffle modes (A77): Rediscover (songs not played in a while first) and Albums (random albums in track order).
**Side effects:** reads `play_history` per request in Rediscover mode; DataStore key `shuffle_mode` (the old `shuffle` boolean is read once as a fallback).
**Before:** shuffle was on or off; the server shuffle had one order.
**After:** as described in the 2026-10-11 "Shuffle modes" CHANGELOG entry.

**Function:** `loadQueue()`, `toggleShuffle()`, `nextChunk()`, `maybeRefill()`, new `librarySource()` and `continueWithLibraryShuffle()` — `android/.../playback/PlaybackController.kt`; `QueueSource.Shuffled.skipTrackId`, `isLibraryInTitleOrder` — `playback/QueueSource.kt`
**Date:** 2026-10-11
**How added:** bug fix
**Purpose:** shuffle on a tapped song covers the whole library instead of one letter's batch.
**Side effects:** an extra `GET /browse/shuffled` page fetch when the swap happens; the rest of the title-order batch is removed from the queue.
**Before:** shuffle mixed only the 200 title-order songs queued from the tap, then each later 200 in turn.
**After:** as described in the 2026-10-11 "shuffle after tapping a song" CHANGELOG entry.

**Function:** `AuthRepository.enterAsGuest(code, name)`, `requestGuestCode()`, `pollGuestRequest()`, `cancelGuestRequest()`, `setDisplayName()`, `adopt()` — `android/.../data/repository/AuthRepository.kt`; `LoginViewModel.chooseGuest()`, `requestCode()`, `startPolling()`, `stopWaiting()`, `continueWithHandedCode()` — `ui/login/LoginViewModel.kt`; `GuestForm`, `RequestStatus`, `HandedCode` — `ui/login/LoginScreen.kt`; `SessionStore` pending-request and display-name keys; `SettingsViewModel.rename()`
**Date:** 2026-10-11
**How added:** new feature
**Purpose:** guest accounts on Android (A67-A70): name, code, request and wait, the code handed over once, renaming.
**Side effects:** DataStore keys `display_name`, `pending_guest_request_id`, `pending_guest_request_secret`; polling `POST /auth/guest/requests/:id/collect` every 3 s while waiting; cancel on stop.
**Before:** Guest tried to enter at once and showed a code field only after a 401; no names.
**After:** as described in the 2026-10-11 "Guest accounts on Android" CHANGELOG entry.

**Function:** `AccountSelectPage` guest card (`requestCode()`, `stopWaiting()`, the request poll effect, `continueWithHandedCode()`), `loadPendingRequest()` / `savePendingRequest()` — `frontend/src/pages/AccountSelectPage.tsx`; `GuestCodesPanel`, `RevokeGuestDialog` — `frontend/src/components/GuestCodesPanel.tsx`; `NameSection` — `frontend/src/pages/OptionsPage.tsx`; `enterAsGuest({ code, name })`, `setDisplayName()` — `frontend/src/auth/AuthContext.tsx`; `formatDateTime()`, `describeDevice()` — `frontend/src/lib/format.ts`; `cancelGuestCodeRequest()` and `POST /auth/guest/requests/:id/cancel` — `backend/src/db/guestCodeRequests.ts`, `backend/src/routes/auth.ts`
**Date:** 2026-10-11
**How added:** new feature
**Purpose:** the web side of guest accounts (A67-A70): name, code, request and wait, the code handed over once, the admin's request queue and sign-in log, renaming.
**Side effects:** `localStorage` key `brainlessmusic.guestRequest` while a request waits; polling `POST /auth/guest/requests/:id/collect` every 3 s; cancel deletes the pending request row.
**Before:** the guest card had one button and an optional code field; the admin card listed one-use codes; `enterAsGuest(code)` took a code only.
**After:** as described in the 2026-10-11 "Guest accounts on the web" CHANGELOG entry.

**Function:** `checkBoundary()`, `startCrossfade()`, `transitionKind()`, `playWithFade()`, `pauseWithFade()`, `skipWithFade()`, `resetFades()`, `cancelCrossfade()`, `newExoPlayer()`, `sessionPlayer` (now a `ForwardingPlayer`) — `android/.../playback/PlaybackController.kt`; `VolumeRamps` — `playback/VolumeRamps.kt`; `TransitionPrefs`, `BetweenSongs`, `isNextOnAlbum()` — `data/local/TransitionPrefs.kt`; `PlaybackSettings.transitions` and setters; `BetweenSongsOption()` — `ui/settings/SettingsScreen.kt`
**Date:** 2026-10-11
**How added:** new feature
**Purpose:** the A71 fades and A72 album rule on Android, with their settings.
**Side effects:** a second ExoPlayer streams the old song's last seconds during a crossfade, then is released;
settings in DataStore (`between_songs`, `fade_seconds`, `fade_on_pause`, `keep_albums_gapless`).
**Before:** Media3's playlist was already gapless; pause and skip were hard cuts; no fades; the session drove the
ExoPlayer directly.
**After:** fades as set; the session's play, pause and skip go through the same fade helpers as the app's buttons.

**Function:** `YouScreen()`, `SongListScreen()`, `PlaylistsScreen()`, `PlaylistDetailScreen()`, `AddToPlaylistSheet()`, `LikeButton()`; `ProfileRepository` — `android/.../ui/profile/`, `data/repository/ProfileRepository.kt`
**Date:** 2026-10-11
**How added:** new feature
**Purpose:** the Android You tab (A61), likes and playlist editing (A65).
**Side effects:** favorites, less-often and playlist writes through the existing endpoints.
**Before:** nothing on Android showed stats, liked songs or playlists, or could like a song or edit a playlist.
**After:** all of the above; `ProfileRepository` holds the liked-id set shared by every screen.

**Function:** `checkBoundary()`, `startNext()`, `handleEnded()`, `preloadSpare()`, `spareHolds()`, `transitionKind()`, `rampTo()`, `retireSpare()`, `jumpTo()`, `resumePlayback()`, `pausePlayback()`, `replanBoundary()` — `frontend/src/components/PlayerBar.tsx`; `loadTransitionPrefs()`, `saveTransitionPrefs()`, `isNextOnAlbum()`, `canFadeVolume()` — `frontend/src/lib/transitions.ts`; `TransitionSettings()` — `frontend/src/pages/OptionsPage.tsx`
**Date:** 2026-10-11
**How added:** new feature
**Purpose:** gapless playback and the three fades on the web (A56, A71 to A73).
**Side effects:** a second `<audio>` element fetches the next song's stream 15 s into each song; settings in
`localStorage` (`brainlessmusic.transitions`).
**Before:** one element; the next song loaded only on `ended`, so every boundary had a fetch-and-decode gap; pause
and skip were hard cuts.
**After:** the spare element holds the next song and takes over at the boundary, gapless or faded as set; pause,
play and skip fade over 150 ms when on. The `ended` listener moved into the mount-time binding (via `endedRef`).

**Function:** `TRACK_SUMMARY_SELECT`, `getTrackDetailById()` — `backend/src/db/browse.ts`; `fetchPlayable()` — `backend/src/db/playbackState.ts`
**Date:** 2026-10-11
**How added:** new feature
**Purpose:** track summaries carry `albumId` and `trackNumber`, so a player can tell the next track of an album (A72).
**Side effects:** none.
**Before:** summaries had the album title only; `trackNumber` was on the detail alone.
**After:** both fields on every summary and on the resumed queue.

**Function:** `peekGuestCode()`, `claimGuestCode()`, `recordGuestCodeSignin()`, `listGuestCodes()`, `deleteGuestCode()` — `backend/src/db/guestCodes.ts`
**Date:** 2026-10-11
**How added:** new feature
**Purpose:** a guest code as a reusable key to one guest (A69/A70), the sign-in log, and revoke.
**Side effects:** `claimGuestCode` inserts a guest and binds the code on first use; `recordGuestCodeSignin` inserts a log row; `deleteGuestCode` deletes the code's guest (via `deleteUser`) and its log rows.
**Before:** `isRedeemableGuestCode()` / `redeemGuestCode()` allowed one use; deleting a code only removed the row.
**After:** first use mints, later uses return the bound guest unless it has been idle past `GUEST_IDLE_DAYS`; the listing includes the guest's name and its sign-ins; deleting a used code revokes it.

**Function:** `createGuestCodeRequest()`, `listPendingRequests()`, `countPendingRequests()`, `approveGuestCodeRequest()`, `denyGuestCodeRequest()`, `collectGuestCodeRequest()` — `backend/src/db/guestCodeRequests.ts`
**Date:** 2026-10-11
**How added:** new feature
**Purpose:** "Request a code" (A67): a queue the admin answers, and a one-time handover of the token to the waiting device.
**Side effects:** writes `guest_code_requests`; approving also creates a code and a guest; creating deletes rows older than 7 days.
**Before:** nothing — new functions.
**After:** routes `POST /auth/guest/requests`, `POST /auth/guest/requests/:id/collect`, `POST /guest-codes/requests/:id/approve|deny`.

**Function:** `cleanDisplayName()`, `randomGuestName()`, `nameOf()`, `setDisplayName()`, `insertGuest(displayName)`, `listUsers()` — `backend/src/db/users.ts`; `POST /auth/guest`, `PUT /me/name`, `makeRoomForGuest()` — `backend/src/routes/auth.ts`
**Date:** 2026-10-11
**How added:** new feature
**Purpose:** names for guests and accounts (A68), and the guest door reworked around reusable codes.
**Side effects:** writes `users.display_name`.
**Before:** guests had only `guest-xxxxxx`; the guest door burnt a code on use and ignored a wrong code when open.
**After:** new guests get the typed name or `Guest NNNN`; `/auth/me` and `listUsers` return `displayName`; a wrong typed code is a 401; joining a guest skips the cap.

**Function:** `getUserStats()`, `getTrackStat()`, `finishPlay()`, `listLessOftenTracks()` — `backend/src/db/listeningStats.ts`; `recordScrobble()` — `backend/src/db/plays.ts`
**Date:** 2026-10-11
**How added:** new feature
**Purpose:** the profile's numbers (A61) and real listening time (A62).
**Side effects:** `finishPlay` updates `play_history.ms_played` and sets `ms_final`.
**Before:** only server-wide top tracks; `recordScrobble` returned nothing; `ms_played` stopped at the threshold.
**After:** per-account stats by range; `recordScrobble` returns the play id; a play's real length can be recorded.

**Function:** `ListenTracker.onTick()`, `PlaybackController.reportListened()`, `LibraryRepository.finishPlay()` — `android/.../playback/`, `data/repository/LibraryRepository.kt`
**Date:** 2026-10-11
**How added:** materially changed / new
**Purpose:** send how long each play really lasted (A62).
**Side effects:** `PATCH /me/history/:id` on pause, track change and stop.
**Before:** the tracker stopped counting at the scrobble threshold and nothing was sent after the scrobble.
**After:** it keeps counting; the controller reports the total, keyed by the `playId` the scrobble returns.

**Function:** `setUserTheme()` — `backend/src/db/users.ts`; route `PUT /me/theme` and `theme` on `GET /auth/me` in `backend/src/routes/auth.ts`; `syncTheme()` — `frontend/src/auth/AuthContext.tsx`; `hasLocalTheme()`, `isTheme()` (now exported) — `frontend/src/lib/theme.ts`
**Date:** 2026-10-11
**How added:** new feature
**Purpose:** the web theme is saved on the profile (A55).
**Side effects:** `setUserTheme` writes `users.theme`. `syncTheme` sets `data-theme` and the browser copy, or sends one
`PUT /me/theme`.
**Before:** the theme lived only in `localStorage`, per browser; `index.html` reset three of the six themes to blue on
load.
**After:** the profile's theme wins at sign-in; Options saves to the profile; the browser copy is a first-paint cache.

**Function:** `getLibraryStats()` — `backend/src/db/libraryStats.ts`; route `GET /library/stats` in `backend/src/routes/library.ts`; `LibraryStatsLine()` — `frontend/src/components/LibraryStatsLine.tsx`; `formatBytes()`, `formatTotalLength()` — `frontend/src/lib/format.ts`
**Date:** 2026-10-11
**How added:** new feature
**Purpose:** library-wide totals and format breakdown for the Full view (A52).
**Side effects:** none (reads `tracks`).
**Before:** nothing returned library totals; `formatBytes` was private to `ControlCenterPage.tsx`.
**After:** the Full view shows a one-line readout; the Control Center imports the shared `formatBytes`.

**Function:** `Skeleton()`, `SkeletonBlock()`, `SkeletonListRows()`, `SkeletonAlbumGrid()`, `SkeletonAlbumHeader()`, `LoadStateContent()`, `PagedContent()` — `android/.../ui/common/Skeleton.kt`, `ui/common/LoadStateContent.kt`, `ui/library/LibraryScreen.kt`
**Date:** 2026-10-11
**How added:** new feature
**Purpose:** loading states shaped like the screen they stand in for, as on the web (A59).
**Side effects:** none.
**Before:** `LoadStateContent` and the Library's `PagedContent` showed a centred `CircularProgressIndicator`.
**After:** both take a `skeleton` and `loadingLabel`; `Skeleton` adds the 300 ms hold, the pulse and the TalkBack
label. `LoadStateContent` without a skeleton still shows the spinner. Used by the Library tabs, album and artist
detail and search.

**Function:** `setTrackFlags()` — `backend/src/db/library.ts`; `parseBulkIds()`, `deleteTrackAndFile()` and routes `PATCH /tracks`, `POST /tracks/delete` — `backend/src/routes/tracks.ts`
**Date:** 2026-10-11
**How added:** new feature
**Purpose:** bulk hide / not-recommended and bulk delete for the Library Full view's selection (A54).
**Side effects:** `setTrackFlags` updates `tracks` in one transaction. `deleteTrackAndFile` unlinks the track's file,
then calls `deleteTrackRow`; on any unlink error but `ENOENT` it leaves the row.
**Before:** the web client sent one `PATCH`/`DELETE /tracks/:id` per selected row (`Promise.all`); the file-then-row
step lived inline in `DELETE /tracks/:id`.
**After:** one request per bulk action; `DELETE /tracks/:id` and `POST /tracks/delete` share `deleteTrackAndFile`.

**Function:** `deleteLibraryRoot()` — `backend/src/db/libraryRoots.ts`; route `DELETE /library/roots/:id` in `backend/src/routes/library.ts`
**Date:** 2026-10-11
**How added:** new feature
**Purpose:** removes a library root and the tracks found under it (A51).
**Side effects:** deletes `tracks` rows for the root (and, via `deleteTrackRow`, their favorites, `less_often`,
playlist entries, play history and playback failures), the root's `scan_failures`, and the `library_roots` row. No
filesystem writes.
**Before:** detached the tracks (`root_id = NULL`) and kept them; the route marked them missing first.
**After:** the tracks are deleted in the same transaction; the route no longer marks anything missing.

**Function:** `Skeleton()`, `SkeletonListRows()`, `SkeletonAlbumGrid()`, `SkeletonTrackRows()`, `SkeletonDetailHeader()`, `SkeletonArcade()` — `frontend/src/components/Skeleton.tsx`
**Date:** 2026-10-11
**How added:** new feature
**Purpose:** loading states shaped like the content they stand in for (A59).
**Side effects:** none.
**Before:** each page showed a text line ("Loading albums…") or, in the Full view, "Loading…".
**After:** `Skeleton` wraps the placeholders with a screen-reader label and the 300 ms hold; the others mirror the
artists/playlists list, `AlbumGrid`, the track tables, the detail headers and `ArcadeSelect`. Used by the Library
(both views), Albums, Artists, album and artist detail, Playlists, playlist detail, Favorites and Search.

**Function:** `markLessOften()`, `unmarkLessOften()`, `clearLessOften()`, `listLessOftenTrackIds()`, `keptThisPass()` — `backend/src/db/lessOften.ts`; routes in `backend/src/routes/lessOften.ts`
**Date:** 2026-10-11
**How added:** new feature
**Purpose:** per-account "play less often" marks (A60) and the shuffle rule that reads them.
**Side effects:** writes `less_often`.
**Before:** nothing — new functions. `GET /browse/shuffled` shuffled every playable track.
**After:** `/browse/shuffled` drops a marked song from a pass unless `keptThisPass(id, seed)`.

**Function:** `PlaybackController.removeAt()`, `restore()`, `move()`; `QueueSheet()` — `android/.../playback/PlaybackController.kt`, `ui/playback/QueueSheet.kt`
**Date:** 2026-10-11
**How added:** new feature
**Purpose:** edit the queue from the Now Playing sheet: remove, undo, reorder, search, play less often.
**Side effects:** `playLessOften` calls `PUT /tracks/:id/less-often`; Undo calls `DELETE`.
**Before:** the queue sheet only listed tracks and skipped to one on tap.
**After:** `removeAt(index)` returns a `RemovedEntry` (item + play-order position) that `restore()` puts back;
`move(from, to)` reorders in play order (shuffle order when shuffled). Each entry has a stable key in
`PlaybackUiState.keys`.

**Function:** `SettingsScreen()`, `SettingsPageScreen()`, `PageRow()`, `Card()` — `android/.../ui/settings/SettingsScreen.kt`
**Date:** 2026-10-11
**How added:** refactor
**Purpose:** Settings as a list of pages instead of one long screen.
**Side effects:** none.
**Before:** one scrolling screen with Appearance, Playback and Account sections under headings.
**After:** `SettingsScreen` lists the pages (`PageRow`) and calls `onOpenPage`; `SettingsPageScreen(page)` shows one
page's settings on a `Card`, with a back arrow and the mini player.

**Function:** `PlaybackService.onTaskRemoved()`, `PlaybackSettings.keepPlayingWhenSwipedAway` / `setKeepPlayingWhenSwipedAway()`, `SwitchRow()` — `android/.../playback/PlaybackService.kt`, `data/local/PlaybackSettings.kt`, `ui/settings/SettingsScreen.kt`
**Date:** 2026-10-11
**How added:** new feature
**Purpose:** let the user choose whether swiping the app away stops the music (A58).
**Side effects:** DataStore write (`keep_playing_when_swiped_away`).
**Before:** swiping away stopped the service only when paused or the queue was empty.
**After:** it also stops when the setting is off (default on). `SwitchRow` is the shared Settings toggle row.

**Function:** `NavHostController.popFrom()`, `NavHostController.openNowPlaying()` — `android/.../ui/navigation/SafeNavigation.kt`
**Date:** 2026-10-11
**How added:** new feature
**Purpose:** back arrows can't pop past their own screen; the player opens once.
**Side effects:** a back tap during a screen's enter animation is ignored (it isn't `RESUMED` yet).
**Before:** player, album and artist back arrows called `popBackStack()` directly; the mini player and Play buttons
pushed a new `now_playing` each tap.
**After:** `popFrom(entry)` pops only while `entry` is `RESUMED`; `openNowPlaying()` navigates with `launchSingleTop`.

**Function:** `RequireAuth()`, `Moved()`, `TitleScreenPage.acceptHandoff()` — `frontend/src/auth/RequireAuth.tsx`, `frontend/src/App.tsx`, `frontend/src/pages/TitleScreenPage.tsx`
**Date:** 2026-10-10
**How added:** new feature
**Purpose:** the title screen lives at `/` while signed out, account select at `/login`; the old `/enter` paths redirect.
**Side effects:** none new.
**Before:** `RequireAuth` redirected signed-out visits to `/enter`; account select was `/enter/profile`;
`acceptHandoff` adopted the token in parallel with the exit animation.
**After:** `RequireAuth` renders the (lazy) title screen at `/` and redirects other paths to `/`. `Moved` redirects
`/enter` → `/` and `/enter/profile` → `/login`, keeping search and hash. `acceptHandoff` waits for the exit and sets
the boot mark before adopting the token (clearing it on failure).

**Function:** `LibraryBottomBar()`, `AppBottomBar()`, `LazyListState.scrollToTop()`, `LazyGridState.scrollToTop()` — `android/.../ui/navigation/`, `ui/library/LibraryScreen.kt`
**Date:** 2026-10-10
**How added:** new feature
**Purpose:** tapping the current bottom tab again scrolls the Library's open tab to the top.
**Side effects:** none.
**Before:** tapping the current tab did nothing.
**After:** both take `onReselect: () -> Unit = {}`, called when the selected item is tapped; `LibraryScreen` scrolls
the open tab's list with the private `scrollToTop()` helpers.

**Function:** `getLetterIndex()` — `backend/src/db/letterIndex.ts`
**Date:** 2026-10-10
**How added:** materially changed
**Purpose:** where each rail entry starts in a listing, now with one entry per script after Z.
**Side effects:** none; one read-only scan per call, as before.
**Before:** always 28 entries: `#`, A–Z, `…` (everything above "z").
**After:** `#` and A–Z always, then `À`/`Ω`/`Я`/`あ`/`ア`/`漢`/`한`/`…` buckets (from the `BUCKETS` table) only when
non-empty. Boundaries are passed as parameters.

**Function:** `LibraryViewModel.songs`, `songFilter`, `setSongFilter()`, `reloadLetters()`, `playSongsFrom()` — `android/app/src/main/kotlin/com/brainlessmusic/app/ui/library/LibraryViewModel.kt`
**Date:** 2026-10-10
**How added:** new feature
**Purpose:** filter the Songs list on the server, and queue from the filtered list.
**Side effects:** `GET /tracks?search=` per settled filter.
**Before:** `songs` was one unfiltered pager; `refresh()`/`registerRefresh()` served a top-bar button; `logout()` and `isGuest` lived here.
**After:** `songs` is rebuilt per debounced filter (`flatMapLatest`, cached after); `playSongsFrom()` passes the filter to
the page fetch and to `QueueSource.Songs`. Refresh is pull-to-refresh in the screen; logout moved to `SettingsViewModel`.

**Function:** `LibraryRepository.getTracksPage()`, `ApiService.tracks()`, `QueueSource.Songs`, `PlaybackController.nextChunk()` — `android/.../data/repository/LibraryRepository.kt`, `data/remote/ApiService.kt`, `playback/QueueSource.kt`, `playback/PlaybackController.kt`
**Date:** 2026-10-10
**How added:** new feature
**Purpose:** carry an optional `search` through song paging and queue top-up.
**Side effects:** none new.
**Before:** no filter.
**After:** `search: String? = null`; `QueueSource.Songs(nextOffset, search)` tops up with matches only.

**Function:** `SettingsScreen()`, `SettingsViewModel.logout()`, `isGuest` — `android/.../ui/settings/`
**Date:** 2026-10-10
**How added:** new feature
**Purpose:** Settings as a bottom tab, with Log out.
**Side effects:** logout stops playback and clears the session, as before.
**Before:** reached from a Library top-bar icon, with a back arrow; no logout.
**After:** takes `navController` and `onLoggedOut`; shows `AppBottomBar`; Log out button with the guest confirmation.

**Function:** `AlbumDetailViewModel.refresh()`, `ArtistDetailViewModel.refresh()`, `refreshing` — `android/.../ui/albums/`, `ui/artists/`
**Date:** 2026-10-10
**How added:** new feature
**Purpose:** pull to refresh without blanking the page.
**Side effects:** one detail request.
**Before:** only `load()`, which shows the spinner.
**After:** `refresh()` keeps the content up and replaces it on success.

**Function:** `UpNextCard()`, `remainingInQueue()` — `android/.../ui/playback/NowPlayingScreen.kt`
**Date:** 2026-10-10
**How added:** new feature
**Purpose:** the Up next card is the way into the queue.
**Side effects:** none.
**Before:** a separate queue icon button beside the stream readout.
**After:** the card shows a queue icon and the count after the current track; the icon button is removed.

**Function:** `MainActivity.onCreate()` splash, `SplashScreen()`, `BrainlessNavGraph()` — `android/.../MainActivity.kt`, `ui/splash/SplashScreen.kt`, `ui/navigation/BrainlessNavGraph.kt`
**Date:** 2026-10-10
**How added:** new feature
**Purpose:** a branded splash on cold start instead of an empty screen.
**Side effects:** none.
**Before:** a plain window, then a centred spinner.
**After:** `installSplashScreen()` held on the activity-scoped `StartViewModel` (max 1.2 s, 200 ms fade); `SplashScreen` takes
`viewModel` and mirrors the system splash, with a progress bar after 400 ms. `BrainlessNavGraph` takes `startViewModel`.

**Function:** `MaterialTheme.accentInk` (and `BrainlessMusicTheme()` providing it) — `android/app/src/main/kotlin/com/brainlessmusic/app/ui/theme/Theme.kt`
**Date:** 2026-10-10
**How added:** new feature
**Purpose:** accent colour for text on a card, where `primary` is under 4.5:1 in Deep blue.
**Side effects:** none.
**Before:** did not exist; card text used `colorScheme.primary`.
**After:** the palette's `accentInk` in dark mode, `accentOnLight` in light mode, `primary` under Material You.

**Function:** `BrainlessMusicTheme()`, `Palette.darkScheme()`, `Palette.lightScheme()`, `ColorTheme.palette()` — `android/app/src/main/kotlin/com/brainlessmusic/app/ui/theme/Theme.kt`, `Color.kt`
**Date:** 2026-10-10
**How added:** new feature
**Purpose:** build the Material scheme from one of the web's six colour themes.
**Side effects:** none.
**Before:** one fixed Deep blue dark scheme and one light scheme.
**After:** takes `colorTheme: ColorTheme` (default `DEEP_BLUE`); each `Palette` builds a dark and a light scheme.
`MATERIAL_YOU` uses the system's dynamic scheme on Android 12+ (`supportsMaterialYou`); the `dynamicColor` parameter
is removed.

**Function:** `AppearanceSettings.colorTheme`, `setColorTheme()`; `SettingsViewModel.colorTheme`, `setColorTheme()`; `ColorThemeOption()` — `android/.../data/local/AppearanceSettings.kt`, `ui/settings/SettingsViewModel.kt`, `ui/settings/SettingsScreen.kt`
**Date:** 2026-10-10
**How added:** new feature
**Purpose:** store and pick the colour theme on this phone.
**Side effects:** writes the `color_theme` DataStore key.
**Before:** did not exist.
**After:** unknown stored values fall back to Deep blue. `MainActivity` reads it synchronously with the light/dark mode.

**Function:** `playerCheckedIn()`, `playerClosed()`, `listListeners()`, `clientLabel()` — `backend/src/services/streamMonitor.ts`
**Date:** 2026-10-10
**How added:** bug fix
**Purpose:** in-memory list of players that checked in within `LISTENER_TTL_MS` (30 s), for the control center's Now playing.
**Side effects:** module state, cleared by `resetStreamMonitor()`.
**Before:** did not exist; Now playing used `listActiveSessions()` (open streams), which empty seconds into a song.
**After:** new. Called from `PUT` / `DELETE /me/playback-state`; `GET /admin/control-center` returns `listeners`.

**Function:** `NavOverflow()` — `frontend/src/components/NavOverflow.tsx`
**Date:** 2026-10-10
**How added:** bug fix
**Purpose:** the nav bar's More dropdown.
**Side effects:** none.
**Before:** menu links stacked with no space, so adjacent hover/active highlights merged.
**After:** each link group is wrapped in a `flex flex-col gap-1` column.

**Function:** `BrainlessMusicTheme()` — `android/app/src/main/kotlin/com/brainlessmusic/app/ui/theme/Theme.kt`
**Date:** 2026-10-10
**How added:** new feature
**Purpose:** the app's Material theme.
**Side effects:** none.
**Before:** `dynamicColor = true` by default (wallpaper colours on Android 12+); loose navy and orange seeds; system font.
**After:** `dynamicColor = false` by default; the web's Deep blue tokens with every surface role set and no tint; display
and headline styles in Barlow Condensed (`DisplayFontFamily`). `BrandFontFamily` (Fredoka) added in `Type.kt` for the
wordmark.

**Function:** `useThemeCycle()` — `frontend/src/hooks/useThemeCycle.ts`
**Date:** 2026-10-10
**How added:** new feature
**Purpose:** cycles `data-theme` on the title and login screens; now also returns the theme on screen.
**Side effects:** sets `data-theme` / `data-theme-cycling` on `<html>`, as before.
**Before:** returned nothing.
**After:** returns the current `ThemeId`, which `TitleHud` shows as `THEME <NAME>`.

**Function:** `TitleHud()` — `frontend/src/pages/TitleScreenPage.tsx`
**Date:** 2026-10-10
**How added:** new feature
**Purpose:** the title screen's corner readouts.
**Side effects:** polls `GET /health` every 30 s, as before.
**Before:** server state in blue or orange; a static `GUEST ENTRY` corner.
**After:** server state green / amber / red; the corner names the live theme. Takes a `theme` prop.

**Function:** `createGuestCode()`, `redeemGuestCode()`, `isRedeemableGuestCode()`, `listGuestCodes()`, `deleteGuestCode()`, `guestCodesRequired()`, `setGuestCodesRequired()`, `normalizeGuestCode()` — `backend/src/db/guestCodes.ts`
**Date:** 2026-10-10
**How added:** new feature
**Purpose:** per-guest entry codes (A42/A43): make, redeem once, list with status and who used them, revoke; read and set the admin toggle that closes the guest door.
**Side effects:** writes `guest_codes` and `server_settings`; `redeemGuestCode()` also inserts a guest `users` row in the same transaction.
**Before:** nothing — new functions. The only code was the shared `ENTRY_CODE` env var.
**After:** admins can hand out one-use codes and close the door from the web.

**Function:** `POST /auth/guest` handler — `backend/src/routes/auth.ts`
**Date:** 2026-10-10
**How added:** new feature
**Purpose:** mints a guest session; now also accepts a per-guest code when the door is closed.
**Side effects:** inserts a guest; burns a per-guest code when one is used.
**Before:** the door was closed only by `ENTRY_CODE`, and only that shared code opened it.
**After:** closed by `ENTRY_CODE` or the admin toggle; opened by the shared code (any number of times) or a per-guest code (once).

**Function:** `guestCodesRoute` (`GET/POST /guest-codes`, `PUT /guest-codes/settings`, `DELETE /guest-codes/:id`) — `backend/src/routes/guestCodes.ts`
**Date:** 2026-10-10
**How added:** new feature
**Purpose:** admin API behind the web "Guest access" card.
**Side effects:** DB writes through `db/guestCodes.ts`.
**Before:** nothing — new routes.
**After:** admin-only; reports whether `ENTRY_CODE` is set without returning it.

**Function:** `deleteUser()`, `pruneIdleGuests()` — `backend/src/db/users.ts`
**Date:** 2026-10-10
**How added:** new feature
**Purpose:** remove a user and everything that points at them.
**Side effects:** now also nulls `guest_codes.used_by` (both) and `guest_codes.created_by` (`deleteUser`).
**Before:** a user named on a guest code could not be deleted (foreign key).
**After:** the code row stays, without the name.

**Function:** `GuestCodesPanel` — `frontend/src/components/GuestCodesPanel.tsx`; `downloadGuestCodeCard()`, `guestCodeLink()`, `prettyGuestCode()` — `frontend/src/lib/guestCodeCard.ts`
**Date:** 2026-10-10
**How added:** new feature
**Purpose:** the admin card on `/users`, and the PNG guest pass (QR plus the code in large type).
**Side effects:** API calls to `/guest-codes`; clipboard writes; a file download.
**Before:** nothing — new.
**After:** admins share codes as text, link or image.

**Function:** guest code prefill in `AccountSelectPage` — `frontend/src/pages/AccountSelectPage.tsx`
**Date:** 2026-10-10
**How added:** new feature
**Purpose:** a QR link (`/enter/profile?code=`) opens the guest card with the code field shown and filled.
**Side effects:** removes `?code=` from the address bar with `history.replaceState`.
**Before:** the code field appeared only after a 401.
**After:** a shared link is one press to enter.

**Function:** `AuthRepository.enterAsGuest()`, `LoginViewModel.chooseGuest()` / `enterAsGuest()`, `LoginScreen` entry modes, `LibraryRepository.scrobble()`, `TokenProvider.isGuest` — `android/app/src/main/kotlin/com/brainlessmusic/app/`
**Date:** 2026-10-10
**How added:** new feature
**Purpose:** Android Log in / Guest buttons (A41), the guest code form, and guest listen-only behaviour (A37).
**Side effects:** `POST /auth/guest` then `GET /auth/me`; stores the session like a login; scrobbles are skipped for guests.
**Before:** Android was login-only (A29).
**After:** guests can enter from the phone; logging out as a guest asks first.

**Function:** `warm()` — `backend/src/services/transcodeCache.ts`; `POST /tracks/:id/prepare` — `backend/src/routes/tracks.ts`
**Date:** 2026-10-10
**How added:** performance
**Purpose:** starts converting a track into the transcode cache before it is played, choosing the conversion the same way the stream route does.
**Side effects:** may start one ffmpeg run in the background and write a cache entry under `TRANSCODE_PATH`; touches an existing entry.
**Before:** a track was converted only when its stream was requested, and the player waited for it.
**After:** the player can ask ahead; the conversion runs only when a slot would still be left for a real play.

**Function:** `prepareTrack()` — `frontend/src/lib/apiClient.ts`; next-track effect in `PlayerProvider` — `frontend/src/components/PlayerBar.tsx`
**Date:** 2026-10-10
**How added:** performance
**Purpose:** 15 s into the current track, asks the server to prepare the track that plays next, with the current data-saver setting.
**Side effects:** one `POST /api/tracks/:id/prepare` per track that stays current for 15 s; errors are ignored.
**Before:** nothing was prepared ahead.
**After:** the next track is usually converted by the time it starts.

**Function:** `getMediaToken()`, `loadStoredMediaToken()`, `setToken()` — `frontend/src/lib/apiClient.ts`
**Date:** 2026-10-10
**How added:** performance
**Purpose:** hands out the media token used in stream and cover URLs, reusing a stored one minted under the current session until it is due for renewal.
**Side effects:** reads and writes `brainlessmusic.mediaToken` in `localStorage`; `setToken()` removes it.
**Before:** the token lived only in memory, so every page load minted a new one and every cover URL changed.
**After:** the token survives reloads and is shared by tabs on the same session, so cover URLs and the browser cache stay stable until renewal.

**Function:** `registerSpa()` — `backend/src/plugins/spa.ts`
**Date:** 2026-10-10
**How added:** performance
**Purpose:** serves the built web app and its `index.html` fallback.
**Side effects:** none.
**Before:** every file was sent with `public, max-age=0`.
**After:** files under `assets/` get `public, max-age=31536000, immutable`; everything else gets `no-cache`.

**Function:** CORS registration in `buildApp()` — `backend/src/app.ts`; `config.corsOrigins` — `backend/src/config.ts`
**Date:** 2026-10-10
**How added:** hardening
**Purpose:** decides which other websites a browser lets read API responses.
**Side effects:** none.
**Before:** `origin: true`, so every origin was allowed.
**After:** only the origins in `CORS_ORIGINS`; none by default (`origin: false`).

**Function:** `redactUrl()` — `backend/src/utils/redactUrl.ts`; `req` log serializer — `backend/src/app.ts`
**Date:** 2026-10-10
**How added:** hardening
**Purpose:** replaces the `token` query value with `[redacted]` in each logged request URL.
**Side effects:** none.
**Before:** Fastify's default serializer logged stream and cover URLs with their media token.
**After:** the same fields are logged, with the token hidden.

**Function:** `rejectDeletedUser()` — `backend/src/plugins/auth.ts`
**Date:** 2026-10-10
**How added:** hardening
**Purpose:** run at the end of `authenticate` and `authenticateMedia`; answers `401` and clears `request.user` when the token's user row no longer exists.
**Side effects:** one user read per authenticated request.
**Before:** a validly signed token worked until it expired, even after its user was pruned or deleted.
**After:** the token stops working as soon as the row is gone.

**Function:** `clientIp()` — `backend/src/utils/clientIp.ts`
**Date:** 2026-10-10
**How added:** hardening
**Purpose:** the address a rate limiter counts against: the `config.clientIpHeader` header when one is configured and present, otherwise `request.ip`.
**Side effects:** none.
**Before:** nothing — new function. The limiters used `request.ip`, which behind cloudflared is always the tunnel container's address.
**After:** used by the guest-mint, passcode and password limiters in `routes/auth.ts`.

**Function:** `POST /auth/login` handler — `backend/src/routes/auth.ts`
**Date:** 2026-10-10
**How added:** hardening
**Purpose:** password sign-in.
**Side effects:** in-memory counter per client IP (`passwordLoginLimiter`).
**Before:** unlimited attempts.
**After:** `429` with `retry-after` past `config.loginAttemptsPerMinute` (default 10) attempts per IP per minute, checked before bcrypt; a correct password clears the IP's window.

---

**Function:** migration `0017_delete_guest_playlists_and_favorites.sql` — `backend/src/db/migrations/`
**Date:** 2026-10-10
**How added:** new feature (A38)
**Purpose:** one-off data cleanup: deletes guest-owned `playlist_tracks`, `playlists` and `favorites` rows in one transaction.
**Side effects:** DB deletes on every database it runs against (production at the next smol deploy). Irreversible except from a backup.
**Before:** guests' pre-A37 playlists and favorites sat in the database, unreachable.
**After:** none remain; accounts' rows and guest identities are untouched. Covered by `db/guestDataCleanup.test.ts`.

**Function:** Stop hook changed-file detection — `.claude/hooks/stop-check.mjs`
**Date:** 2026-10-10
**How added:** bug fix (A40)
**Purpose:** decides which files this turn touched, for the type-check and the CHANGELOG / schema-doc checks.
**Side effects:** runs `git status --porcelain -uall -z` at the end of each turn.
**Before:** only the Edit/Write/MultiEdit list; with no such edit the hook exited at once, so shell edits were never checked.
**After:** the union of that list and the working tree's changed and untracked files. Uncommitted work from another agent can trigger an extra check, never a missed one.

**Function:** `requireAccount` — `backend/src/plugins/auth.ts`
**Date:** 2026-10-09
**How added:** new feature (A37, guests are listen-only)
**Purpose:** preHandler run after `authenticate`; re-reads the user and answers `403` when the row is missing or `kind = 'guest'`.
**Side effects:** one user read per request on the routes it guards.
**Before:** only `authenticate` and `requireAdmin` existed, so a guest could call every playlist, favorite, history, stats and scrobble route.
**After:** guards 18 routes (playlists, favorites, history, top tracks, scrobble, passcode). `routes/guestAccess.test.ts` fails if a route's gate drifts from its table.

**Function:** `RequireAccount` — `frontend/src/auth/RequireAccount.tsx` (new file)
**Date:** 2026-10-09
**How added:** new feature
**Purpose:** route guard for `/favorites` and `/playlists/*`; shows a guest an inline "Needs an account" message instead of the page.
**Side effects:** none.
**Before:** guests could open both pages, whose requests would now get 403.
**After:** guests see why; accounts see the page as before.

**Function:** `FavoriteButton` / `useFavoriteIds()`, `TrackRowMenu`, `navItemsFor()`, `scrobble()` — `frontend/src/components/FavoriteButton.tsx`, `TrackRowMenu.tsx`, `AppShell.tsx`, `PlayerBar.tsx`
**Date:** 2026-10-09
**How added:** new feature
**Purpose:** hide guest-blocked controls: no heart and no favorite-ids query for guests; "Add to playlist" only when the caller passes a handler (LibraryFull omits it for guests); no Favorites/Playlists nav links; the player's `scrobble` returns early for guests via `isGuestRef`.
**Side effects:** guests make no favorites or scrobble requests.
**Before:** every user saw and could use these.
**After:** a guest sees browse and play controls only. `isGuestRef` exists because `scrobble` runs from listeners bound once on mount.

**Function:** `seededShuffle(items, seed)` — `backend/src/services/shuffle.ts`
**Date:** 2026-09-28
**How added:** new feature (Android endless shuffle)
**Purpose:** Fisher–Yates shuffle driven by a seeded PRNG (mulberry32); the same seed always gives the same order. Returns a new array.
**Side effects:** none.
**Before:** only `smartShuffle` (random, artist-spread), which cannot be re-derived on a later request.
**After:** lets `GET /browse/shuffled` serve one long shuffle in pages without storing it. Not a security-grade generator and not meant to be.

**Function:** `shuffledTracksRoute` / `listPlayableTrackIds()` — `backend/src/routes/shuffledTracks.ts`, `backend/src/db/shuffledTracks.ts` (new files)
**Date:** 2026-09-28
**How added:** new feature
**Purpose:** `GET /api/browse/shuffled?seed&offset&limit` — playable (on disk, not hidden) track ids, seeded-shuffled, sliced, then hydrated with `getTrackSummariesByIds` and put back in slice order.
**Side effects:** none (read-only).
**Before:** —
**After:** if the plain list's default filter changes (hidden/missing), `listPlayableTrackIds` must change with it or "shuffle everything" would offer tracks the list hides.

**Function:** `getLetterIndex(scope)` — `backend/src/db/letterIndex.ts` (new file)
**Date:** 2026-09-28
**How added:** new feature (Android alphabet rail)
**Purpose:** returns `{ total, letters: [{ letter, offset, count }] }` for `tracks`, `albums` or `artists`: the start offset of `#`, `A`–`Z` and `…` in that scope's default, NOCASE-sorted listing. One `SELECT` of `SUM(col COLLATE NOCASE < 'x')` per boundary; buckets are the runs below "a", a–z, and above "z".
**Side effects:** none (read-only).
**Before:** nothing told a client where a letter starts; the web rail computes it from rows it has already loaded.
**After:** a client that pages can jump to a letter without loading everything before it. The scope filters deliberately copy the lists' defaults (missing/hidden excluded; albums and artists need a playable track) — if a list's default filter changes, this must change with it or jumps land on the wrong row.

**Function:** `lettersRoute` — `backend/src/routes/letters.ts` (new file)
**Date:** 2026-09-28
**How added:** new feature
**Purpose:** `GET /api/browse/letters?scope=` behind `fastify.authenticate`; 400 for an unknown or missing scope.
**Side effects:** none.
**Before:** —
**After:** registered in `app.ts` after `shuffleRoute`.

**Function:** `LibraryPage()` / `SimpleLibrary()` — `frontend/src/pages/LibraryPage.tsx`
**Date:** 2026-09-28
**How added:** refactor + new feature
**Purpose:** `SimpleLibrary` is the previous `LibraryPage` body, unchanged (the arcade select). `LibraryPage` is now a wrapper: a Simple/Full toggle above either `SimpleLibrary` or `LibraryFull`. The view is `?view=` if present, else the stored per-device choice (`loadLibraryView()`), else Simple; `chooseView()` writes the storage and the URL together, clearing other params when leaving Full since the filters belong to it.
**Side effects:** `localStorage` write (`brainlessmusic.libraryView`) on toggle.
**Before:** the page was only the arcade select; sorting, filters and the table lived on the admin-only `/manage`.
**After:** every signed-in user can reach both views from the Library. `/manage` redirects to `/?view=full` (`App.tsx`); the "Manage" nav item is removed.

**Function:** `LibraryFull()` — `frontend/src/components/LibraryFull.tsx` (new file)
**Date:** 2026-09-28
**How added:** refactor (moved from `ManageTracksPage`) + restyle
**Purpose:** the album-grouped, AIMP-style table. Filters live in the URL; an infinite query (100 per page) feeds a fixed-height, inner-scrolling panel that requests the next page within 480px of the bottom, and again after each page in case the panel is not yet scrollable. `groupByAlbum()` folds consecutive same-album rows into blocks when sorted by album; any other sort renders a flat list. For a non-admin it omits checkboxes, the bulk bar, the hidden filter, and (via `TrackRowMenu`'s `isAdmin`) edit/hide/delete.
**Side effects:** `PATCH`/`DELETE /tracks/:id` for admins (bulk hide/un-hide/delete, row menu) — unchanged from the old page; invalidates the `['tracks']` queries after.
**Before:** `ManageTracksPage` — a paged plain table, admin-only route.
**After:** "Select all" now means all *loaded* rows (there is no page to mean), and the cover column is an absolutely-positioned box plus a filler row so a one-track album isn't stretched to the cover's height. Drawing the read-only mode is tidiness; the server enforces it (see `GET /tracks` below).

**Function:** `GET /tracks` handler and `listTracks()` — `backend/src/routes/tracks.ts`, `backend/src/db/browse.ts`
**Date:** 2026-09-28
**How added:** hardening (route) + bug fix (ordering)
**Purpose:** the route now forces `hidden: 'exclude'` unless the caller's `is_admin` — read from the DB with `findUserById`, the way `requireAdmin` does — is set. `listTracks` appends per-sort tiebreakers (`SORT_TIEBREAKERS`, ending in `t.id`) to its `ORDER BY`; only the primary key flips with `order=desc`.
**Side effects:** none — one extra indexed user lookup per request.
**Before:** any authenticated user could pass `?hidden=all|only` and list admin-hidden tracks. Equal sort keys came back in unspecified order, so an album sorted by album was in random track order and `LIMIT/OFFSET` paging could repeat or skip a row at a page seam.
**After:** a non-admin's `hidden` is ignored; album sort reads album → artist → track number → title, and every ordering is total. Three new tests in `routes/api.test.ts`. Other endpoints that can return hidden tracks (search, album/artist detail) were not audited.

---

**Function:** `streamStarted()` / `streamEnded()` / `listActiveSessions()` — `backend/src/services/streamMonitor.ts`
**Date:** 2026-09-28
**How added:** refactor (counter → identified sessions)
**Purpose:** track each open stream with who and what, so the Control Center can say who is listening to which track rather than only how many.
**Side effects:** in-memory `Map` only.
**Before:** `streamStarted()`/`streamEnded()` took no arguments and incremented/decremented a bare counter.
**After:** `streamStarted({ userId, username, trackId, trackTitle })` returns a session id that the stream route hands to `streamEnded(id)` on `close`; `getHealthSnapshot().activeStreams` is the map size (shape unchanged), and `listActiveSessions()` is served only through the admin-gated `/admin/control-center`. Ending an id twice is a no-op, so the count cannot go negative.

**Function:** `getSystemStats()` — `backend/src/services/systemStats.ts`
**Date:** 2026-09-28
**How added:** new feature
**Purpose:** the server's own memory, CPU, disk and transcode-cache usage for the Control Center.
**Side effects:** `fs.statfs` reads; module state for the previous CPU sample (a call under 1s after the last repeats its answer).
**Before:** nothing — new function.
**After:** CPU is this process only — ffmpeg children are not counted. A volume that is unmounted is left out rather than failing the response.

**Function:** `replaceScanFailures()` / `listScanFailures()` / `countScanFailures()` — `backend/src/db/scanFailures.ts`
**Date:** 2026-09-28
**How added:** new feature
**Purpose:** keep the files each root's last scan couldn't read, instead of dropping `ScanSummary.failures` when `syncLibrary()` returns.
**Side effects:** DB writes to `scan_failures` (delete-then-insert in one transaction per root).
**Before:** nothing — new functions; the failures existed only in memory during a scan.
**After:** called from `syncLibrary()` only when a scan ran, so a reconcile-only pass cannot wipe the last real list.

**Function:** `deleteTrackRow()` / `pruneIdleGuests()` / `deleteUser()` / `deleteLibraryRoot()` — `backend/src/db/library.ts`, `users.ts`, `libraryRoots.ts`
**Date:** 2026-09-28
**How added:** bug fix
**Purpose:** clear `playback_failures` / `scan_failures` rows before deleting the parent row.
**Side effects:** extra `DELETE`s inside each existing transaction; `deleteUser()` now runs in a transaction.
**Before:** foreign keys are enforced and none cascade, so a track, guest or user with a `playback_failures` row (or a root with `scan_failures`) could not be deleted.
**After:** regression tests in `db/failureLogs.test.ts`.

**Function:** `describeStreamFailure()` / `StreamLoadError` / retry in `load()` and `reconnect()` — `frontend/src/components/PlayerBar.tsx`
**Date:** 2026-09-18
**How added:** new feature (diagnostics) + bug fix
**Purpose:** turn a generic load failure into "reason; served as <type>", and retry once through the compat transcode on a decode / unsupported-format `MediaError`.
**Side effects:** a second ranged `fetch` of the stream URL (3s timeout, best effort); `reportPlaybackFailure()` POST on the final failure.
**Before:** a hardcoded "The stream could not be loaded", raised only from `waitForMetadata()`; a bare `audio.play()` rejection carried nothing.
**After:** both paths raise `StreamLoadError` carrying `mediaErrorCode`, `contentType` and a rendered `detail`; retryable codes (3, 4) call the load attempt again with `forceCompat`. At most one retry.

**Function:** `variantFor()` — `backend/src/routes/tracks.ts`
**Date:** 2026-09-18
**How added:** hardening
**Purpose:** choose which converted copy, if any, a stream request gets.
**Side effects:** none.
**Before:** WebKit compat only for `.opus`/`.ogg` sources.
**After:** `?compat=1` also forces it for any source, still only when the User-Agent is WebKit-only.

**Function:** `POST /tracks/:id/playback-failure` — `backend/src/routes/tracks.ts`
**Date:** 2026-09-18
**How added:** new feature
**Purpose:** record a decode failure the stream route cannot observe.
**Side effects:** pino warn line; insert into `playback_failures`; 404 for an unknown track (added 2026-09-28 once foreign-key enforcement made the insert throw).
**Before:** nothing — new endpoint.
**After:** the player calls it fire-and-forget; failures to report are swallowed.

**Function:** `PlayerProvider()`'s render output — `frontend/src/components/PlayerBar.tsx`
**Date:** 2026-09-16
**How added:** refactor (visual redesign, no state/logic change)
**Purpose:** unchanged (renders the phone mini-strip and the desktop bar) — restyled both from plain `btn-ghost`/`rounded-md` utility classes to a new arcade "control deck" look: `.player-deck` (gradient background + sweeping top line), `.player-play-btn`/`.player-transport-btn` (round, beveled, glowing while playing via `.pulse-ring.is-playing`), `.player-pill` (icon toggles that light up orange via `.is-active` instead of just recoloring text), and `.player-meter-outer`/`.player-meter-track`/`.player-meter-fill`/`.player-meter-range` (a segmented ladder meter with a real, visible knob) replacing the plain native `<input type="range">` styling for both the seek bar and the volume slider.
**Side effects:** none — purely which classes/markup render; `toggle`/`seek`/`setVolume`/etc. are all called exactly as before.
**Before:** a flat `border-t border-blue-800 bg-blue-900` bar with text-label buttons ("Shuffle", "Repeat", "Data saver") and an unstyled native range for seek/volume.
**After:** see `.docs/CHANGELOG.md` (2026-09-16, "Player bar redesigned as an arcade control deck"). One real bug found and fixed mid-build: `.player-deck` briefly had an explicit `position: relative`, which — being an unlayered rule — overrode Tailwind's layered `fixed` utility outright and dropped the bar off the bottom of the viewport; removed since both usages already carry `fixed`.

**Function:** `NowPlaying()` — `frontend/src/components/NowPlaying.tsx`
**Date:** 2026-09-16
**How added:** new feature (parity with the desktop bar) + visual redesign
**Purpose:** gained a mute button + volume slider between the transport buttons and the format-spec badges, using the same `volume`/`setVolume`/`toggleMute` from `PlayerContextValue` the desktop bar already used — no new player-state logic, just a second consumer of it. Styled with the same `.player-meter-*` ladder-meter classes as the desktop bar's seek/volume controls, and the sheet's existing hollow-ring play button gained `.pulse-ring.is-playing` for the same glow the desktop bar's solid play button has (a separate class from `.player-play-btn` specifically so it doesn't also inherit that button's solid-bevel background, which would have clobbered the sheet's intentional hollow-ring look).
**Side effects:** none new — `setVolume`/`toggleMute` already existed and already write to `localStorage`/the `<audio>` element.
**Before:** volume was desktop-bar-only; the phone sheet had no way to change it short of the OS/browser's own mixer.
**After:** phone users get the same mute + slider control, verified via a scripted Playwright pass opening the sheet and checking `input[aria-label="Volume"]` renders and responds.

**Function:** `setVolume()` / `toggleMute()` — `frontend/src/components/PlayerBar.tsx`
**Date:** 2026-09-16
**How added:** new feature
**Purpose:** `setVolume(n)` clamps to 0-1, updates state, persists to `localStorage`, and applies directly to `audioRef.current.volume` in the same call (not through a reactive effect — a dragged slider fires many times a second). `toggleMute()` sets volume to 0 and remembers the pre-mute level in a ref for the next toggle to restore.
**Side effects:** `localStorage` write (`brainlessmusic.volume`); mutates the live `<audio>` element's `volume` property.
**Before:** nothing — no volume control existed anywhere in the app; only the OS/browser mixer.
**After:** a mute button + slider on the desktop player bar, wired through `PlayerContextValue.volume`/`setVolume`/`toggleMute`. Verified with a scripted pass (drag the slider, mute, unmute, checking the persisted value at each step).

**Function:** `PlayerProvider()` — `frontend/src/components/PlayerBar.tsx`
**Date:** 2026-09-16
**How added:** bug fix
**Purpose:** unchanged (provides playback state/controls app-wide, renders the mini/desktop bar and the expanded `NowPlaying` sheet) — added an `onAttractScreen` check (`useLocation().pathname.startsWith('/enter')`) alongside the existing `user && current` gate on all three render blocks.
**Side effects:** none new — purely which JSX renders, not playback itself.
**Before:** `PlayerProvider` wraps the whole router (so playback survives navigation), which meant the bar rendered on `/enter`/`/enter/profile` too — visible right through the title/account-select screens' own full-screen interstitial cards, since those live outside `AppShell` and don't know the bar exists.
**After:** the bar (all three render paths) stays hidden while on an `/enter*` route; a track already playing keeps playing, it just has no visible control surface there.

**Function:** `scanLibrary()` — `backend/src/services/scanner.ts`
**Date:** 2026-09-16
**How added:** new feature (live scan progress) on top of an already-present, uncommitted change to run file scanning concurrently (`SCAN_CONCURRENCY = 6`, `Promise.all` per batch) instead of one file at a time.
**Purpose:** takes an optional `onProgress?: (processed, total) => void`, called once per file as its batch settles, so a caller has *some* live signal for what used to be a single opaque `await` covering the whole file loop.
**Side effects:** none of its own — `onProgress` is the caller's, and this function never inspects the values it passes.
**Before:** no way to observe a scan's progress except waiting for the whole `ScanSummary` to resolve at the end.
**After:** `librarySync.ts`'s `syncLibrary()` passes a callback that records `{ processed, total }` per root, exposed via `getScanProgress()` and surfaced through `GET /library/roots`. New test in `scanner.test.ts` asserting the callback fires exactly once per file and — since files now run concurrently and land in completion order, not file order — that the *set* of `processed` values still covers 1..N by the time the scan resolves.

**Function:** `getScanProgress()` / the `scanProgress` map — `backend/src/services/librarySync.ts`
**Date:** 2026-09-16
**How added:** new feature
**Purpose:** per-root live scan progress, alongside the existing `running` set. Populated by the `onProgress` callback passed into `scanLibrary()`, cleared in the same `finally` that clears `running` so a finished scan doesn't leave a stale entry for the next poll. `null` covers two states a caller needs to tell apart: not scanning, or scanning but still inside the initial directory walk before a file count exists.
**Side effects:** none — an in-memory `Map`, same lifetime and shape as `running`.
**Before:** nothing — new state.
**After:** `GET /library/roots` (admin-only) returns `scanProgress` per root. Surfaced in the Options page's per-folder row and, aggregated across all scanning roots, in the Library page's arcade strip footer (admin-only there too, since the underlying endpoint is) — both via one shared `formatScanStatus()` in `frontend/src/lib/format.ts` so the wording doesn't drift between the two screens.

**Function:** `findAudioFiles()` — `backend/src/services/scanner.ts`
**Date:** 2026-09-16
**How added:** bug fix (found while adding root-content validation, not by reading)
**Purpose:** unchanged goal — walk a root and return every audio-extension file under it — but rewritten as a hand-rolled recursive walk (directory by directory, catching each `readdir`'s own failure) instead of one `readdir(root, { recursive: true })` call. Returns `{ files, unreadableDirs }` instead of a bare array.
**Side effects:** none — still read-only.
**Before:** a single unreadable subdirectory anywhere in the tree threw and aborted the *entire* scan. Every Windows drive has at least one (`System Volume Information`, `$RECYCLE.BIN`), confirmed with a real `/mnt/d` drive once `/mnt` became mountable — this was not a hypothetical edge case, it was the default state of any real external drive.
**After:** one unreadable subdirectory is skipped and counted; everything else under the root still scans normally. `ScanSummary` gained `unreadableDirs: number`, surfaced in Options' scan-result toast when non-zero. New test in `services/scanner.test.ts` (a `chmod 0o000` subdirectory alongside a real file, confirming both the file is still found and the count is right).

**Function:** `POST /library/roots`'s post-scan check — `backend/src/routes/library.ts`
**Date:** 2026-09-16
**How added:** new feature (validation)
**Purpose:** after the insert-then-scan that already happened, if `scan.filesFound === 0` the just-inserted root is deleted again and the request 400s — a directory being readable never meant it contained music. Reuses the scan that already ran rather than walking the tree a second time.
**Side effects:** `deleteLibraryRoot()` on the rejection path — safe here specifically because zero files were found, so no track ever referenced the root's id in the first place.
**Before:** any readable directory was accepted and registered permanently, music or not.
**After:** two new tests in `routes/library.test.ts` — an empty folder is rejected and never appears in `GET /library/roots`; a folder with just one audio-extension file (content doesn't need to actually be valid audio — that's a separate, per-file scan concern) is accepted.

---

**Function:** `GET /library/browse` — `backend/src/routes/library.ts`
**Date:** 2026-09-16
**How added:** new feature (folder picker for adding a library root)
**Purpose:** lists the subdirectories of an admin-supplied container path — `resolve('/', path)` to canonicalize, `readdir(..., { withFileTypes: true })` filtered to directories (symlinks skipped, so a self-referential one can't loop the dialog), sorted case-insensitively, capped at 500 with a `truncated` flag. Backs `LibraryBrowseDialog`'s click-to-descend UI on Options, since a native OS folder picker cannot expose an absolute path and the path that matters is inside the container anyway.
**Side effects:** none — read-only.
**Before:** nothing — adding a root required already knowing its exact absolute path and typing it blind.
**After:** paired with a `docker-compose.yml` change mounting `/mnt:/mnt:ro` (every WSL2-exposed Windows drive, read-only — nothing this app writes ever lands outside the default root) so a new drive is browsable and pickable without a further compose edit or restart; a narrower single-drive mount remains available as a documented alternative. New `backend/src/routes/library.test.ts` (6 tests): directories-only listing, correct `parent` including `null` at `/`, default-to-`/`, 400 on a missing/non-directory path, 403 for a non-admin.

**Function:** `LibraryBrowseDialog` — `frontend/src/components/LibraryBrowseDialog.tsx` (new file)
**Date:** 2026-09-16
**How added:** new feature
**Purpose:** the dialog itself — current path, an "Up a level" row, click-to-descend, Escape/backdrop/Cancel all leaving the caller's path field untouched, "Use this folder" writing the picked path back. Chrome copied from `ConfirmDeleteDialog`/`HandoffDialog` (`useScrollLock`, backdrop + `card` panel); Escape-to-close is new here, following `AdminNumpad`/`NavOverflow`'s existing pattern rather than the two dialogs it borrowed chrome from.
**Side effects:** none — calls the read-only browse endpoint only.
**Before:** nothing — `OptionsPage`'s "Add folder" row was a bare text input.
**After:** wired into `LibrarySection` (`frontend/src/pages/OptionsPage.tsx`) via a `browsing` boolean and a "Browse…" button next to the existing path input.

---

**Function:** `useThemeCycle()` — `frontend/src/hooks/useThemeCycle.ts` (new file)
**Date:** 2026-09-16
**How added:** new feature
**Purpose:** advances `document.documentElement.dataset.theme` through every entry in `THEMES` on a 20s interval while mounted, setting `data-theme-cycling` (what a new `:root[data-theme-cycling]` transition in `index.css` is scoped to) so a manual pick in Options stays instant. Skips entirely under `prefersReducedMotion()` (reused from `lib/interstitial.ts`). Restores `loadTheme()` directly on unmount — never writes to `localStorage`.
**Side effects:** none — a DOM attribute and a timer, no storage writes.
**Before:** nothing — `TitleScreenPage`/`LoginPage` rendered whatever the saved theme happened to be, statically.
**After:** called unconditionally from both pages (both already outside `RequireAuth`). Paired with `frontend/src/index.css` registering every themed `--color-*`/`--app-ground`/`--backdrop-*` custom property via `@property` (`inherits: true`, required since `@property` defaults to `false`) so the transition actually interpolates instead of snapping.

**Function:** `LibraryEmptyState` — `frontend/src/components/LibraryEmptyState.tsx` (new file)
**Date:** 2026-09-16
**How added:** refactor (shared component, extracted from `LibraryPage.tsx`)
**Purpose:** the "no music in the library yet" block (scan-in-progress bar or admin/guest-specific copy), previously local to the arcade select's empty state, now shared by `LibraryPage.tsx`, `AlbumsPage.tsx` and `ArtistsPage.tsx`.
**Side effects:** polls `GET /admin/health` while mounted (same as before extraction).
**Before:** `LibraryPage.tsx` had this inline; `AlbumsPage.tsx` rendered nothing for zero albums; `ArtistsPage.tsx` showed its own one-line text.
**After:** all three pages read identically, and a real scan is visible from any of them, not just the arcade select. Also moved `GET /health`'s route (`App.tsx`) and nav link (`AppShell.tsx`) behind the existing `RequireAdmin` gate — it was reachable by any signed-in user, guest included; `GET /admin/health` itself stays open, since this component's scan bar depends on it from non-admin pages.

---

**Function:** `ensureDefaultLibraryRoot()` / `deleteLibraryRoot()` — `backend/src/db/libraryRoots.ts` (new file)
**Date:** 2026-09-15
**How added:** new feature (multi-root library)
**Purpose:** `ensureDefaultLibraryRoot(libraryPath)` seeds `library_roots` with the app's original single folder and adopts every pre-existing track into it — a no-op once any root exists, called once at boot since a migration can't read the `LIBRARY_PATH` env var itself. `deleteLibraryRoot(id)` detaches (not cascades) a root's tracks — `root_id = NULL` — before deleting the row, in one transaction.
**Side effects:** both write to `tracks`/`library_roots`.
**Before:** nothing — no concept of a "root" existed beyond the single `config.libraryPath`.
**After:** the detach-then-delete order in `deleteLibraryRoot` is load-bearing, not stylistic — foreign keys are enforced (better-sqlite3's bundled SQLite defaults it on), so deleting a root row while tracks still reference it fails outright rather than leaving anything dangling.

---

**Function:** `syncLibrary()` / `startLibrarySyncSchedule()` — `backend/src/services/librarySync.ts`
**Date:** 2026-09-15
**How added:** hardening (multi-root support)
**Purpose:** `syncLibrary` now takes a `rootId` alongside the root path, and its in-flight guard (`running`) became a `Set<number>` keyed by root id instead of one shared boolean. `startLibrarySyncSchedule` loops over `listLibraryRoots()` (read fresh every tick) instead of hardcoding the single configured path.
**Side effects:** unchanged per-call; the lock's shape changed.
**Before:** one boolean meant scanning any root blocked every other root's scan for as long as the first happened to take, and the scheduler only ever knew about one hardcoded path.
**After:** a root added from the UI is picked up by the very next scheduled tick, no restart needed. `isLibrarySyncRunning(rootId)` (per-root) and a new `isAnyLibrarySyncRunning()` (whole-server, for `/admin/health`) replace the old no-argument `isLibrarySyncRunning()`.

**Follow-up the same day, found by manually deleting a test root's directory
against the live container:** `syncLibrary` now `stat`s the root before
attempting a scan, skipping it (rather than letting `scanLibrary`'s
`readdir` throw `ENOENT`) when the root can't be read — `reconcileMissingTracks`
still runs and reports it. Before this, a rescan of a root whose folder had
vanished entirely was a 500, not the graceful "unreachable" outcome the
reconcile step already had. New test: `services/librarySync.test.ts`.

---

**Function:** `reconcileMissingTracks()` / `listTrackPaths()` — `backend/src/services/scanner.ts`, `backend/src/db/library.ts`
**Date:** 2026-09-15
**How added:** hardening (multi-root support)
**Purpose:** both now take an optional/explicit root id so a sweep judges one root's own tracks rather than every track in the database — the guard-ratio abort logic and the `checked` count are meaningless across roots otherwise.
**Side effects:** none new — same reads, now filtered.
**Before:** `reconcileMissingTracks(libraryRoot)` called `listTrackPaths()` unscoped; with a second root registered, one root's outage would be diluted (or a healthy root's guard wrongly tripped) by every other root's track count.
**After:** covered by three new tests in `services/reconcile.test.ts` proving isolation both directions (a root's own mass-deletion still trips its own guard despite healthy tracks elsewhere; a different root's mass-deletion doesn't trip this one's).

---

**Function:** `seed-users.ts` (script) — `backend/src/scripts/seed-users.ts`
**Date:** 2026-09-15
**How added:** new feature (requested: repeatable creation of two named admin accounts)
**Purpose:** upserts a hardcoded list of `{ username, password, isAdmin }` fixtures — currently `unskill` and `meran`, both admin, password `6969` — using `findUserByUsername`/`insertUser`/`setPasswordHash`/`setAdmin` from `db/users.ts` exactly as `set-admin.ts`/`set-password.ts` already do, run via `npm run seed-users`.
**Side effects:** inserts or updates rows in `users`.
**Before:** nothing — creating a second admin required either the bootstrap-then-register dance or hand-editing the DB.
**After:** re-running it is safe — an existing username gets its password and admin flag reset instead of the script erroring on a duplicate, so it doubles as a "make sure these two people can always get in" command for a wiped `/data` volume.

---

**Function:** `LoginPage`'s `handleSubmit()` catch block — `frontend/src/pages/LoginPage.tsx`
**Date:** 2026-09-15
**How added:** bug fix / behavior change (superseded this morning's own fix, per direct follow-up feedback)
**Purpose:** no longer calls `setUnlockTicket(null)` on a 401 — a wrong password now shows its error inline on the login form and leaves the ticket alone, rather than clearing it and letting the page's own redirect guard send the user back through the numpad.
**Side effects:** removed — the ticket-clearing side effect this entry replaces.
**Before (earlier today):** a 401 cleared the ticket, triggered a redirect to `/enter`, and forwarded the error as router state so `TitleScreenPage` could display it (see the two entries below this one, now superseded).
**After:** the router-state forwarding those two functions existed for became unreachable, since this path no longer redirects at all — both were removed rather than left as dead code with nothing left to feed them.

---

**Function:** `updateParams()` / `onSort()` / `toggleSelectAllOnPage()` / `SortHeader` — `frontend/src/pages/ManageTracksPage.tsx`
**Date:** 2026-09-15
**How added:** new feature (Phase 5, `library-management-interface`)
**Purpose:** `updateParams` merges a patch into the URL's search params (deleting `page` by default, so any filter change lands back on page 1) — every other new function here is a thin caller of it. `onSort(field)` sets the active sort column, flipping direction if it's already active. `toggleSelectAllOnPage` selects/deselects every track id on the current page without touching selections from other pages. `SortHeader` (module-scope, not a closure inside the page component) renders one clickable, direction-indicating column header.
**Side effects:** `updateParams`/`onSort` call `setSearchParams` (a URL/history write); `toggleSelectAllOnPage` writes `selectedIds` state.
**Before:** sort was one `<select>` plus a separate asc/desc button; filters were five independent `useState` calls with no URL representation; multi-select required clicking every row.
**After:** `SortHeader` is deliberately a module-level function, not one defined inside `ManageTracksPage`'s body — a component type recreated every render remounts on the very click that re-renders its parent, which would drop keyboard focus from the header button a user just pressed.

---

**Function:** `TrackDetailDrawer`'s `handleSave()` and its seeding effect — `frontend/src/components/TrackDetailDrawer.tsx`
**Date:** 2026-09-15
**How added:** hardening (closed a UI gap, no backend change)
**Purpose:** the Tags tab's save now also carries `hidden`/`notRecommended`, seeded from the loaded track alongside title/artist/album/track-number. `TrackPatchInput` already accepted both fields — this was the drawer catching up to the API, not new backend capability.
**Side effects:** `PATCH /tracks/:id` now includes two more fields when the drawer's own Save button is used.
**Before:** `hidden`/`notRecommended` were editable only from `TrackRowMenu`'s per-row menu or `ManageTracksPage`'s bulk-action bar — never from the drawer that already edits everything else about the same track.
**After:** one form now fully edits a track; the row menu and bulk bar are unchanged (still valid, faster paths for the common case of flipping just one flag).

---

**Function:** `toTrackSummary()` / `TRACK_SUMMARY_SELECT` — `backend/src/db/browse.ts`
**Date:** 2026-09-15
**How added:** hardening (additive response field, no migration)
**Purpose:** projects `t.date_added` into every `TrackSummary`-shaped response (`listTracks`, `getTrackSummaryById`, `getTrackSummariesByIds`, search results) — the column already existed and was already a valid `SortField`, just never included in the row itself, so a client could sort by it but never display what it sorted by.
**Side effects:** none — read-only projection of an existing column.
**Before:** `TrackDetail` (the single-track shape) declared its own `dateAdded: string`, redundant now that it inherits one from `TrackSummary`; removed.
**After:** `RawTrackSummary`'s `Omit<TrackSummary, 'hidden' | 'notRecommended' | 'missing'>` picked up `dateAdded` automatically — no boolean coercion needed for it, so `toTrackSummary()` itself needed no code change beyond the wider input type.

---

**Function:** `LoginPage`'s render guards and `handleSubmit()` — `frontend/src/pages/LoginPage.tsx`
**Date:** 2026-09-15
**How added:** bug fix (two, found in sequence testing the same flow)
**Purpose:** the top-of-render redirect that used to fire on any truthy `user` now exempts `user.isGuest` — guest entry is the open default, so most people reaching the numpad already hold a guest session, and the old guard bounced them home before the admin form ever painted. Separately, `handleSubmit`'s 401 branch now forwards its error message as router state on the `Navigate to="/enter"` it triggers (by clearing the ticket), since that redirect previously fired on the very next render — before the message it had just set could ever paint.
**Side effects:** `Navigate`'s `state` prop now carries `{ notice: string | null }` on the ticket-cleared redirect.
**Before:** a guest could not reach the admin login form at all via the numpad; a wrong password (indistinguishable from an expired ticket, by design) silently returned to the title screen with zero explanation.
**After:** `TitleScreenPage` reads and displays that forwarded notice (see below); a real 401 is now visible, not silent.

---

**Function:** `TitleScreenPage`'s `error` seeding + history-scrub effect — `frontend/src/pages/TitleScreenPage.tsx`
**Date:** 2026-09-15
**How added:** bug fix (paired with the `LoginPage` fix above)
**Purpose:** `error` state now initializes from `location.state?.notice` (the message `LoginPage` forwards on a failed-login redirect), reusing the same red error box the guest-entry-code flow already renders. A second effect immediately scrubs that state out of history (`navigate('.', { replace: true, state: null })`) once read, so a later browser back/forward landing on this same history entry doesn't replay a stale login failure.
**Side effects:** one extra history replace on mount, only when arriving with router state.
**Before:** nothing read `location.state`; a failed login's message had nowhere to land.
**After:** none — this pairs with the `LoginPage` change and doesn't affect guest entry's own error flow.

---

**Function:** `AdminNumpad`'s `submit()` and its keyboard effect — `frontend/src/components/AdminNumpad.tsx`
**Date:** 2026-09-15
**How added:** new feature (requested: keyboard input for the numpad)
**Purpose:** `handleSubmit`'s body was extracted into a standalone `submit()` (memoized with `useCallback`) so a `keydown` listener can call it directly without going through the `<form>`'s submit event. The listener maps digits to `press()`, Backspace to deleting the last digit, Enter to `submit()`, and Escape to `dismiss()`.
**Side effects:** adds/removes a `window` `keydown` listener for the component's mounted lifetime (it's a full-screen modal — the only interactive thing on screen while it's up, so nothing else competes for the keys).
**Before:** the numpad only accepted on-screen taps/clicks.
**After:** `dismiss()` and `submit()` had to become `useCallback`s (not plain functions) to satisfy `react-hooks/exhaustive-deps` on the new effect without it re-subscribing on every render for no reason.

---

**Function:** `LoginPage`'s post-login sequence — `frontend/src/pages/LoginPage.tsx`
**Date:** 2026-09-15
**How added:** new feature (requested: a real transition instead of an instant cut)
**Purpose:** on a successful login, the page now sets `isLeaving`, renders `ArcadeInterstitial` with `"Welcome back, <username>"`, waits out `interstitialDuration()`, calls `markJustEntered()` (the same flag the guest-entry flow sets), and only then navigates — instead of the previous instant `<Navigate>` the moment `user` updated.
**Side effects:** none new — reuses `ArcadeInterstitial` and `markJustEntered()` exactly as the rest of the app already does for screen-to-screen transitions and the guest-entry arrival animation, respectively.
**Before:** a successful admin login cut straight to the library with no transition at all, unlike every other screen change in the app.
**After:** the render guards had to gain an `isLeaving` exemption too (see the first `LoginPage` entry above) — without it, `user` becoming truthy mid-transition would have raced the card with an immediate redirect.

---

**Function:** `play()` (in `ArcadeSelect`) — `frontend/src/components/ArcadeSelect.tsx`
**Date:** 2026-09-14
**How added:** new feature (Phase 5)
**Purpose:** the one path every "actually play this" gesture (Enter, the Play button, clicking the already-selected row) now goes through — calls the caller's `onPlay` and bumps `launchToken` to trigger the confirm flash.
**Side effects:** calls `onPlay`; sets `launchToken` state.
**Before:** each of the three call sites called `onPlay` directly.
**After:** `launchToken` starts `null` (not `0`/`false`) specifically so the flash element is never mounted on first render — a toggled boolean would have replayed the animation on mount too, since CSS can't distinguish "mounted for the first time" from "mounted because the state flipped back to its initial value."

---

**Function:** `onPointerDown()` / `onPointerMove()` / `endDrag()` / `clampDelta()` (in `ArcadeSelect`) — `frontend/src/components/ArcadeSelect.tsx`
**Date:** 2026-09-14
**How added:** new feature (Phase 5, added mid-phase on request)
**Purpose:** drag-to-scroll the strip with a mouse or a finger — one Pointer Events implementation for both. The rail tracks the pointer continuously while held (`dragDeltaPx` state, read into the rail's `translateY`) and only commits a real selection change, via `onSelect`, on release. `clampDelta` bounds how far the drag can pull the rail so release can never resolve to an out-of-range row.
**Side effects:** `setPointerCapture` on the strip once a drag crosses the 6px threshold; calls `onSelect` on release if the resolved row differs from the current selection.
**Before:** nothing — the strip had no pointer/touch handling at all, only wheel and keyboard.
**After:** two bugs found and fixed while writing the Puppeteer drag test, not while reading the code:
1. **`clampDelta`'s `min`/`max` bounds were swapped.** Delta (pixels) and row index move in *opposite* directions — dragging up (negative delta) reveals *later* rows — so the bound on how far up you can drag is set by how many rows are *left*, and the bound on how far down is set by how many rows are *behind* the start; the first version had these backwards, which meant dragging up from row 0 (the only direction with anywhere to go there) always clamped the delta straight back to 0. Visible mid-drag transform changes masked it, since the *live* value during the gesture only ever gets smaller in magnitude near a boundary — the bug only showed up in the value actually committed at release.
2. **`endDrag` originally read `dragDeltaPx` from React state**, which is set by the same handler dependency chain that recreates `endDrag` itself on every drag-state change — trusting it at release time means trusting that the final `pointermove`'s render had already committed and rebound the `pointerup` listener before the browser dispatched that event, which is usually but not provably true. Fixed by having `endDrag` compute the delta straight from its own event's `clientY`, exactly as `onPointerMove` already does, removing the race entirely rather than papering over it with a longer wait.

---

**Function:** `onKeyDown()` (in `ArcadeSelect`) — `frontend/src/components/ArcadeSelect.tsx`
**Date:** 2026-09-14
**How added:** new feature (Phase 4)
**Purpose:** keyboard operation of the strip — `↑`/`↓` move the selection, `Home`/`End` jump to the ends, `Enter` plays, any other single printable character is handed to `jumpToLetters` for type-ahead search.
**Side effects:** none directly; calls `onSelect`/`onPlay`. Calls `event.stopPropagation()` for every key it handles.
**Before:** nothing — the strip had no key handling; rows were `<button>`s reachable only by tabbing through all of them individually, one row per tab stop.
**After:** the strip itself (`role="listbox"`, `tabIndex={0}`) holds focus and handles keys; rows became non-focusable `role="option"` elements reporting position via `aria-activedescendant` rather than being tab stops. `stopPropagation()` on the type-ahead branch specifically exists because `PlayerBar` already has a global `window` keydown handler for space/`n`/`p` (pause/next/previous) that only excuses actual form fields (`input`, `textarea`, `select`, `[contenteditable]`) — without it, searching for a title containing a space or the letters `n`/`p` would have also toggled or skipped whatever track was already playing.

---

**Function:** `jumpToLetters()` (in `ArcadeSelect`) — `frontend/src/components/ArcadeSelect.tsx`
**Date:** 2026-09-14
**How added:** new feature (Phase 4)
**Purpose:** type-ahead: accumulates typed characters into a buffer and selects the next track (searching forward from just past the current selection, wrapping around) whose title starts with it.
**Side effects:** calls `onSelect`. Sets/clears a `window.setTimeout` held in a ref.
**Before:** nothing — new function.
**After:** the buffer lives in a `useRef`, not state, since accumulating keystrokes shouldn't itself trigger a render; it resets 700ms after the last keystroke via a timer stored in the same ref (cleared and restarted on every character) so pausing briefly doesn't lose progress but pausing for real starts a fresh search. Search starts one row past the current selection rather than from the top, so repeating the same short buffer (or the same single letter) cycles forward through every matching title instead of always re-landing on the first one.

---

**Function:** `ArcadeSelect()` — `frontend/src/components/ArcadeSelect.tsx`
**Date:** 2026-09-14
**How added:** new feature
**Purpose:** the music-select strip and detail panel — fixed centred cursor, the list travelling under it.
**Side effects:** none directly; calls `onSelect`/`onPlay`/`onNearEnd` callbacks the caller supplies.
**Before:** nothing — new component.
**After:** `ROW_HEIGHT` is a fixed constant rather than measured, because the strip's whole geometry (the centring offset, how far the rail travels) is arithmetic on it — measuring would mean a layout read on every selection change. The rail's offset is `stripHeight / 2 - ROW_HEIGHT / 2 - selected * ROW_HEIGHT`, observed via `ResizeObserver` so a rotated phone keeps the cursor centred without waiting for an unrelated re-render. The wheel handler changes the selection by one row per notch rather than scrolling the strip natively — free scrolling would let the list and the fixed cursor disagree about what is "selected," and a subsequent click could then pick something the cursor was not sitting on. A click on the already-selected row plays; a click on any other row selects — two gestures on one control, distinguished by prior selection state. Rows are `role="option"` elements, not buttons, since Phase 4: a listbox's options are reached by the container's own focus plus `aria-activedescendant`, not by being individually tabbable.

---

**Function:** `LibraryPage()` — `frontend/src/pages/LibraryPage.tsx`
**Date:** 2026-09-14
**How added:** new feature (rewrite; the old file of this name became `ManageTracksPage.tsx`)
**Purpose:** fetch tracks a page at a time and feed them to `ArcadeSelect`.
**Side effects:** GET `/tracks`, paginated; queues playback via `usePlayer`.
**Before:** `LibraryPage` rendered the sortable/filterable table (moved to `ManageTracksPage`, unchanged).
**After:** `useInfiniteQuery` requests 200 rows per page — the server's own cap (`MAX_LIMIT` in `backend/src/utils/pagination.ts`), so this is the fewest round trips the server will allow. `loadMore` is guarded on both `hasNextPage` and `isFetchingNextPage`; the strip calls it on every selection change while near the loaded tail, and without the second guard a single flick of the wheel fires several identical requests before the first returns. `getNextPageParam` returns `undefined` (React Query's "no more pages" signal) once the loaded count reaches the server-reported total, rather than a past-the-end offset that would fetch an empty page forever. `play()` filters missing tracks out of the queue before it is built, matching the guard the old table's row click already had, since queueing a missing file stalls the queue on a mid-playback 500.

---

**Function:** `formatDuration()` — `frontend/src/lib/format.ts`
**Date:** 2026-09-14
**How added:** bug fix (consolidation of three divergent copies)
**Purpose:** one definition of how a duration is written, shared by every screen that shows one.
**Side effects:** none.
**Before:** defined separately in `ManageTracksPage.tsx`, `TrackDetailDrawer.tsx` and `AlbumDetailPage.tsx`. Two of the three rounded the seconds (`Math.round(seconds % 60)`); the third floored them. Rounding is wrong on its own: `Math.floor(59.7 / 60)` is 0 minutes and `Math.round(59.7)` is 60 seconds, so a 59.7-second track printed `0:60` — any duration within half a second of a minute boundary hit it.
**After:** one flooring implementation, imported by all three call sites plus the new `ArcadeSelect`. Flooring matches the convention a player already uses for elapsed time: a track reads "3:59" until it is actually 4:00.

---

**Function:** `ManageTracksPage()` — `frontend/src/pages/ManageTracksPage.tsx` (renamed from `LibraryPage`)
**Date:** 2026-09-14
**How added:** refactor (rename + relocation, per A18)
**Purpose:** the sortable, filterable track table with admin bulk actions, now separated from the listening surface.
**Side effects:** unchanged — same queries, same mutations.
**Before:** rendered at `/`, titled "Library", the only way to browse tracks.
**After:** rendered at `/manage`, behind `RequireAdmin`, titled "Manage tracks". No behavioural change beyond the route and heading — sort, the four filters, search, per-row flags, favouriting and the checkbox multi-select with bulk hide/recommend/delete are byte-for-byte the same code. Reachable from the top bar's overflow menu, added to `navItemsFor`'s admin branch in `AppShell.tsx`.

---

**Function:** `loadTheme()`, `applyTheme()` — `frontend/src/lib/theme.ts`; `OptionsPage()` — `frontend/src/pages/OptionsPage.tsx`
**Date:** 2026-09-11
**How added:** new feature
**Purpose:** three themes, chosen per device.
**Side effects:** writes `brainlessmusic.theme` to `localStorage`; sets `data-theme` on the document element.
**Before:** colours were Tailwind classes resolving to fixed palette values, plus literal `rgb()`/hex in the backdrop and bar.
**After:** a theme is a block of `--color-*` overrides under `[data-theme]`, which works because Tailwind 4 compiles utilities to `var(--color-*)` — no component was changed. `loadTheme` validates against the known ids and falls back rather than trusting storage; both functions wrap storage access, which throws outright when a browser blocks site data. `applyTheme` writes `data-theme="blue"` for the default rather than removing the attribute, so no selector or check has to distinguish "default" from "never applied". The pre-paint application is an inline script in `index.html`, not this module — by the time React runs it is already too late to avoid a flash.

---

**Function:** `SpinRing()`, `FloatingMotes()` — `frontend/src/components/BackdropDepth.tsx`; `ShellBackdrop()` — `frontend/src/components/AppShell.tsx`
**Date:** 2026-09-11
**How added:** new feature
**Purpose:** give the backdrop depth with things that are not type.
**Side effects:** none.
**Before:** five wordmark columns and two crawling bands — all the same kind of element, so the field read as one busy plane.
**After:** `SpinRing` puts four tilted, counter-turning orange bands behind everything; `FloatingMotes` drifts circles on two axes where the columns only move on one. `ShellBackdrop` grew a third type tier. The ring's position is measured rather than chosen: centred at x≈1148 on a 1440px window it sat inside the mask's protected reading band, so the brightest part of it was the part being hidden — `right: -22%` puts the arc in the gutter instead. `MOTES` is a fixed table because `Math.random()` in a component body re-rolls every render and twice under StrictMode. Presence was bought by darkening the page ground (`.app-ground`) rather than raising layer opacity, which is free where text sits and is why the behind-text cost is 8/255 while the gutters reached 56–65.

---

**Function:** `leaveThrough()`, `onTabClick()`, `navItemsFor()` — `frontend/src/components/AppShell.tsx`; `ArcadeInterstitial()` — `frontend/src/components/ArcadeInterstitial.tsx`; `interstitialDuration()`, `interstitialTotal()` — `frontend/src/lib/interstitial.ts`; `NavOverflow()` — `frontend/src/components/NavOverflow.tsx`; `OptionsPage()` — `frontend/src/pages/OptionsPage.tsx`
**Date:** 2026-09-11
**How added:** new feature
**Purpose:** a top bar that fits a phone, and screen changes that announce themselves.
**Side effects:** one timer per navigation; navigates.
**Before:** `navItemsFor` returned one flat list; `onTabClick` ran a directional view transition; Options was a dropdown panel; Data saver lived in the player bar.
**After:** `navItemsFor` returns `{ primary, overflow }` because the bar collapses in stages — below `lg` every tab is in the menu. `leaveThrough` guards on its own state, since two presses would otherwise start two timers racing to navigate. `interstitialDuration` returns **0** under reduced motion rather than a shorter time, so the navigation is immediate: shortening the animation while keeping the timer is a mistake made once already on the title screen's exit, where the screen simply sat still for the full duration. `onTabClick` no longer calls `startViewTransition` — the card is opaque and covers the viewport, so the slide underneath was invisible; `rememberDirection` and its CSS are kept so restoring it is four lines. Returns early when the clicked tab is the current one.

---

**Function:** `playFrom()` — `frontend/src/pages/LibraryPage.tsx`
**Date:** 2026-09-11
**How added:** change
**Purpose:** play a track with the rest of the visible page queued behind it.
**Side effects:** replaces the player queue.
**Before:** the queue-building logic was inline in the row's ▸ button; the row itself opened the tag editor.
**After:** extracted and called by both the row and the button, so the two cannot drift apart. The row click changing from "edit tags" to "play" is the point of the change: on a phone there is one gesture per row and no hover, and it was being spent on the rarest action rather than the only one that matters. Favorites and playlists already behaved this way, so this makes the library consistent rather than novel. Guards `missing` up front, where the old inline version relied on the button's `disabled` — a guard on the button does nothing for a click on the row.

---

**Function:** `handleExit()` — `frontend/src/components/AppShell.tsx`; `markAtTitle()`, `isAtTitle()`, `clearAtTitle()` — `frontend/src/lib/boot.ts`
**Date:** 2026-09-11
**How added:** new feature
**Purpose:** leave the app for the title screen without ending the session.
**Side effects:** writes `brainlessmusic.atTitle` in `sessionStorage`; navigates.
**Before:** nothing in the header went back to the title screen, and typing `/enter` while signed in redirected straight back into the app.
**After:** `handleExit` sets the flag and navigates; `TitleScreenPage` exempts its own redirect when the flag is set, which is the whole mechanism — the redirect is right in every other case and wrong only for someone who meant to come here. `clearAtTitle` runs on the way back in, so a later reload lands in the app. Not a logout, and that is load-bearing for a guest: there is no password to return with, so dropping the token would abandon the row and everything attached to it. The flag is read once into state rather than live, because clearing it happens while the exit animation is still playing and a live read would flip the gate mid-animation.

---

**Function:** `WordmarkBand()`, `WordRun()`, `Lettering()` — `frontend/src/components/WordmarkColumn.tsx`
**Date:** 2026-09-11
**How added:** new feature
**Purpose:** the wordmark crawling sideways across the backdrop.
**Side effects:** none.
**Before:** the backdrop was five vertical columns; `Word` inlined its own lettering.
**After:** `Lettering` is split out so the vertical `Word` and the horizontal `WordRun` share one definition of what the lockup looks like. `WordRun` repeats it `REPEATS` (8) times: the loop shifts by exactly one run, so a run narrower than the window shows as a gap crossing the screen. Eight is enough at any window shape without measuring, because the type is sized in `vw` — a wider screen gets proportionally wider letters, so the count needed to cross stays put. Verified at 6747px per run against a 1425px window.

---

**Function:** `onTabClick()`, `rememberDirection()`, `navItemsFor()`, `activeIndex()` — `frontend/src/components/AppShell.tsx`
**Date:** 2026-09-11
**How added:** new feature
**Purpose:** change tabs inside a view transition, in the direction you moved along the bar.
**Side effects:** sets `data-nav-dir` on the document element; navigates.
**Before:** `NavLink`s rendered straight from JSX and navigated instantly.
**After:** the bar is data (`navItemsFor`) because two things need its order — which tab is active, and whether the clicked one is left or right of it. `onTabClick` calls `document.startViewTransition` **directly**: React Router's own `viewTransition` prop is a data-router API and this app runs under `<BrowserRouter>`, so the prop is accepted and silently ignored — counted at the API, it started zero transitions. `flushSync` is required so the DOM is in its new state before the callback returns; React would otherwise batch the update past the snapshot. Modified clicks and non-primary buttons return early, so opening a tab in a new window still works.

---

**Function:** `AppShell()` — `frontend/src/components/AppShell.tsx`
**Date:** 2026-09-11
**How added:** bug fix
**Purpose:** stop the opening sequence from being able to hide the app.
**Side effects:** one timer.
**Before:** `isBooting` was read once and never cleared; the staged classes came off only when the component unmounted.
**After:** cleared after `BOOT_MS` (1,500) whatever the animations did. The owner reported the library not appearing after pressing enter: React StrictMode remounts components in development, which recreates the staged elements and restarts their animations *and their delays*, leaving the track list invisible a second and a half in. The trigger was StrictMode; the fault was gating already-loaded content on an animation with no deadline. Worst case is now a sequence that ends abruptly rather than an app that never appears.

---

**Function:** `ShellBackdrop()` — `frontend/src/components/AppShell.tsx`
**Date:** 2026-09-11
**How added:** change
**Purpose:** the app's moving backdrop.
**Side effects:** none.
**Before:** two wordmark columns parked in the gutters, `hidden` below `2xl` — because decoration behind a data table is a bug, and a breakpoint was the blunt way to guarantee it never got there.
**After:** five columns, full-bleed, in two tiers moving against each other — far (small, faint, slow, climbing) and near (large, brighter, quick, falling). The constraint the breakpoint enforced is now enforced by a mask instead, which keeps the motion visible on the screens most people use rather than only above 1536px. Beat counts are co-prime (128/97/113 against 67/53) so the field never visibly loops. Below `md` the inner three drop out: a phone has no gutters, so every column there is behind the text and three of them is clutter rather than depth. Measured cost behind the page heading: 5/255 worst pixel, against 20/255 in the gutter where it is supposed to be doing its job.

---

**Function:** `WordmarkColumn()` — `frontend/src/components/WordmarkColumn.tsx`
**Date:** 2026-09-11
**How added:** change
**Purpose:** one column of sideways wordmark, now able to fall as well as climb.
**Side effects:** none.
**Before:** every column climbed. Siblings differed only in speed and phase.
**After:** a `reverse` prop sets `animation-direction`, reusing the same keyframes rather than adding a mirrored copy of them. Counter-scrolling is what separates two planes passing each other from one sheet sliding — speed alone does not do it, because the eye reads a slower neighbour as the same surface.

---

**Function:** `markJustEntered()`, `consumeJustEntered()` — `frontend/src/lib/boot.ts`
**Date:** 2026-09-11
**How added:** new feature
**Purpose:** make the opening sequence a one-shot instead of a mount effect.
**Side effects:** writes and clears one `sessionStorage` key.
**Before:** nothing — new module.
**After:** `AppShell` mounts on every reload and stays mounted across route changes, so "animate on mount" would replay a 1.2-second assembly every time the tab is refreshed. `sessionStorage` rather than router state, which is lost on a reload but *kept* on a back-navigation — exactly backwards from what is wanted; and rather than `localStorage`, which would replay the boot in a new tab that never saw the title screen. Both calls are wrapped, because blocked site data throws on access and the app is identical without the animation.

---

**Function:** `handleEnter()`, `acceptHandoff()`, `exitDuration()` — `frontend/src/pages/TitleScreenPage.tsx`
**Date:** 2026-09-11
**How added:** change
**Purpose:** play the shut-off while the session is being minted, and come back if it fails.
**Side effects:** as before, plus the boot flag and a manual navigation.
**Before:** awaited the mint, then let the `<Navigate>` at the top of the component fire on the next render.
**After:** `Promise.all` on the mint and a timer, so the two run together — awaiting the mint first left the button on "Entering…" for a whole round trip before anything moved. The `<Navigate>` is now gated on `isLeaving`, because `enterAsGuest` sets `user` and the redirect would otherwise cut the animation on its first frame; the navigation is done by hand when the picture has gone. A failure clears `isLeaving`, which reverses the whole sequence rather than stranding the caller on black. `exitDuration()` exists because the stylesheet can stop the picture moving but only this side decides how long the route change waits — without it, reduced motion was slower than the animation it was meant to skip.

---

**Function:** `BootFrame()` — `frontend/src/components/AppShell.tsx`
**Date:** 2026-09-11
**How added:** new feature
**Purpose:** run one orange lap of the window's border as the app assembles.
**Side effects:** none.
**Before:** nothing — new component.
**After:** an SVG rect with `pathLength="1"`, so the dash is expressed in units of "the whole perimeter" and stays correct at any window size with nothing measured and no resize observer. **No `viewBox`**, which is the part worth remembering: a viewBox with `preserveAspectRatio="none"` is the obvious way to fill a box and it breaks this twice over — the non-uniform scale turns a 2-unit stroke into a 25px slab down one side, and `vector-effect: non-scaling-stroke` then fixes the thickness while moving dash measurement into screen space, drawing ten stubby segments instead of one line. Without a viewBox, user units are CSS pixels and neither problem exists. Geometry lives in CSS so percentages resolve against the element box.

---

**Function:** `useSecretTaps()` — `frontend/src/hooks/useSecretTaps.ts`
**Date:** 2026-09-11
**How added:** new feature
**Purpose:** turn repeated taps on the wordmark into the admin entrance.
**Side effects:** none.
**Before:** nothing — new hook.
**After:** counts taps that each land within `gapMs` of the one before. The gap is what makes it a gesture rather than a trap — a child mashing the logo never produces seven evenly-spaced taps and then stops. A lapsed streak resets to **one**, not zero: the tap that broke the streak is still a tap, and starting the count from nothing would make a fumbled attempt need eight.

---

**Function:** `TitleScreenPage()`, `TitleHud()`, `tokenFromHash()` — `frontend/src/pages/TitleScreenPage.tsx`
**Date:** 2026-09-11
**How added:** new feature
**Purpose:** the front door — enter as a guest, adopt a handoff, or reach the hidden admin door.
**Side effects:** mints a guest (`POST /auth/guest`); rewrites the address bar via `replaceState`.
**Before:** `LoginPage` was the unauthenticated destination, and asked for a username and password.
**After:** one button, and three things it has to handle. The **entry code** is learned by trying: the first press without one returns 401, which reveals the code field — the server never advertises whether it wants a code, and does not need to. The **handoff token** is read during the first render rather than in an effect, so the ordinary enter button never paints for a frame first, and the hash is stripped immediately because a token in a URL survives screenshots and the back button. `TITLE_SIZE` is clamped against `vh` as well as `vw`, since a landscape phone has width and no height, and its `vw` ceiling is derived from what must fit (the wordmark measures ~6.6x the font size) rather than chosen by eye.

---

**Function:** `AdminNumpad()` — `frontend/src/components/AdminNumpad.tsx`
**Date:** 2026-09-11
**How added:** new feature
**Purpose:** collect the admin entry code and exchange it for an unlock ticket.
**Side effects:** `POST /auth/unlock`; writes the ticket to `sessionStorage`.
**Before:** nothing — new component.
**After:** a keypad rather than an `<input>`, because a numeric input summons a keyboard that covers half the screen it is standing on. The code is never echoed — dots, not digits — since a keypad held at arm's length in a room with other people is the normal case. A 429 says something different from a 401: "try again" is useless advice when the answer is "not for a minute". It never checks the code itself; that happens on the server, or the secret would ship in the bundle.

---

**Function:** `HandoffDialog()` — `frontend/src/components/HandoffDialog.tsx`
**Date:** 2026-09-11
**How added:** new feature
**Purpose:** make a second device the same listener, and hold the one destructive action a guest has.
**Side effects:** none — draws a QR from the token already in `localStorage`.
**Before:** nothing — new component. The plan had specified a `GET /auth/handoff` endpoint behind this.
**After:** no endpoint was built: the client already holds the token, so asking the server to repeat it back would be a round trip to learn something it had just used. The link is presented as `select-all` text beside the QR because `navigator.clipboard` needs a secure context and this app runs on plain HTTP over a LAN — the copy button is the convenience, not the mechanism. "Forget this device" lives here behind a two-step confirmation rather than in the header, because for a guest it is not a log-out: it is the permanent loss of a row nothing can ever authenticate as again.

---

**Function:** `enterAsGuest()`, `adoptToken()`, `signInWith()` — `frontend/src/auth/AuthContext.tsx`
**Date:** 2026-09-11
**How added:** new feature
**Purpose:** the two passwordless ways to become somebody.
**Side effects:** store a token; `GET /auth/me`.
**Before:** `login()` was the only way in, and inlined its own store-then-fetch.
**After:** all three paths funnel through `signInWith`, so "what it means to be signed in" is defined once. `login()` now sends the unlock ticket when one is held — the server ignores it unless `ADMIN_ENTRY_CODE` is set, so this is inert on a LAN. `adoptToken` deliberately **replaces** rather than merges: there is no way to merge two listening histories that does not invent a policy for conflicting queues, and the screen that calls it says so first.

---

**Function:** `insertGuest()`, `countGuests()`, `countAccounts()`, `touchLastSeen()` — `backend/src/db/users.ts`
**Date:** 2026-09-11
**How added:** new feature
**Purpose:** mint and account for passwordless guest rows.
**Side effects:** `insertGuest` and `touchLastSeen` write to `users`.
**Before:** nothing — every row in `users` had a password.
**After:** `insertGuest` writes `kind = 'guest'` with an empty hash and a `guest-<6 hex>` name, retrying on the vanishingly unlikely name collision rather than letting a public endpoint return a 409 nobody could act on. `countAccounts` exists because `countUsers` became the wrong question: it decides whether a fresh server is still claimable, and a guest minted by the first visitor must not close that window. `touchLastSeen` is called from `/auth/me` only — from the auth decorator it would be a write per streamed byte range, and the only reader measures in days.

---

**Function:** `pruneIdleGuests()` — `backend/src/db/users.ts`
**Date:** 2026-09-11
**How added:** new feature
**Purpose:** make room at the guest ceiling by collecting rows nothing can ever log back into.
**Side effects:** deletes from `playlist_tracks`, `playlists`, `favorites`, `play_history`, `playback_state` and `users`, in one transaction.
**Before:** nothing — new function.
**After:** the only code in the project that deletes user data without a person pressing something, so its bounds are structural rather than remembered: it can only match `kind = 'guest'`, it is called only from `POST /auth/guest` at the cap (never on a timer), and staleness falls back to `created_at` when `last_seen_at` is still null. Deletes are explicit because none of this project's foreign keys cascade, matching `deletePlaylist`. `tracks.play_count` is deliberately not decremented — it counts what was played, and the plays happened.

---

**Function:** `createRateLimiter()` — `backend/src/services/rateLimit.ts`
**Date:** 2026-09-11
**How added:** new feature
**Purpose:** fixed-window per-key counting for the two endpoints anyone can call.
**Side effects:** none — in-process memory only.
**Before:** nothing — new module. No endpoint was reachable without a credential, so nothing needed counting.
**After:** limits are passed at `check` time rather than at construction, so a config value changed at runtime takes effect on the next request instead of being frozen in when the route was registered — which is also what makes it testable. Expired windows are swept when a request arrives, since that is the only moment the map can have grown. `resetAllRateLimiters()` exists for tests, where module-level singletons would otherwise leak state between cases in one process.

---

**Function:** `signUnlockTicket()`, `verifyUnlockTicket()` — `backend/src/services/token.ts`
**Date:** 2026-09-11
**How added:** new feature
**Purpose:** prove a browser answered the admin numpad, so `/auth/login` can require it.
**Side effects:** none.
**Before:** nothing — new functions.
**After:** a third token type joins the session and media tokens. It carries **no `sub`** and stands for a fact about a device rather than a person, so holding one proves only that someone got past the numpad. The existing scope rules needed no edit to stay safe: `verifySessionToken` already rejects *any* scoped token and `verifyMediaToken` demands `media` specifically, so the new ticket was refused as a credential and in a media URL before either function knew it existed. There are tests asserting exactly that.

---

**Function:** `POST /auth/guest`, `POST /auth/unlock`, `unlockedForLogin()`, `secretMatches()` — `backend/src/routes/auth.ts`
**Date:** 2026-09-11
**How added:** new feature
**Purpose:** the passwordless front door, and the server-side gate in front of the password one.
**Side effects:** `/auth/guest` inserts a `users` row and may prune others; both endpoints consume a rate-limit budget.
**Before:** the only way in was `POST /auth/login` with a username and password.
**After:** `/auth/guest` mints a row and signs the ordinary session token, so no client path downstream needs a new branch. `/auth/unlock` checks `ADMIN_ENTRY_CODE` **on the server** — a code compared in React would be shipped to everyone it hides from — and a wrong code and an unconfigured one return byte-identical replies, so the numpad cannot be used to detect whether a server even has an admin door. `unlockedForLogin` is transparent when no code is set, so this is inert on a LAN. A refused login says `invalid username or password` whether the password or the ticket was the problem, because a distinct "you need the code" would confirm the account exists. `secretMatches` is `timingSafeEqual` with a length short-circuit — that leaks the configured code's length and nothing else, which is worth far less than the timing signal it removes.

---

**Function:** `setDataSaver()` — `frontend/src/components/PlayerBar.tsx`
**Date:** 2026-09-10
**How added:** change
**Purpose:** switch quality on the playing track without a gap in the music.
**Side effects:** one warm-up request, then reassigns `audio.src`; writes the preference.
**Before:** assigned `audio.src` immediately and then waited for the file. On a cold cache that was **5.71 s of silence** for a 172-second track, with a perfectly good copy playing the whole time — the loudest possible answer to a button press. It was invisible while every test ran warm.
**After:** the converted copy is warmed first (the readout probe doubles as the wait — its response does not arrive until the file exists), and the element is touched only once the file is there. The resume point is read *after* the wait, since the track kept playing. A `swappingRef` suppresses `timeupdate` for the duration, because reassigning `src` resets the element's clock to 0 and painting that flicked the scrubber back by 8.9 s. Overlapping presses are resolved by a token plus an `AbortController`. Failure puts the toggle back rather than leaving it claiming a quality that is not being served — but an `AbortError` is exempt, since a page navigating away mid-request is not a refusal and reverting there quietly undid a choice the listener had made.

---

**Function:** `probeServedStream()` — `frontend/src/lib/streamQuality.ts`
**Date:** 2026-09-10
**How added:** change
**Purpose:** report what the server actually sent, and double as the "is the copy ready" wait.
**Side effects:** one `Range: bytes=0-0` request.
**Before:** read the total only out of `Content-Range`, which only a 206 carries. Chrome can answer a repeat request from its own HTTP cache with a 200, so a cache hit returned `null` — which the caller read as "could not prepare the copy", showed an error toast for, and reverted the preference over. The readout would also have silently vanished on those responses.
**After:** prefers `Content-Range` and falls back to `Content-Length`, so both a fresh 206 and a cached 200 are understood. A 206's `Content-Length` is 1, which is why the range is still tried first.

---

**Function:** `savePlaybackState()` / `loadPlaybackState()` / `clearPlaybackState()` — `backend/src/db/playbackState.ts`
**Date:** 2026-09-10
**How added:** new feature
**Purpose:** remember where each listener was, and hand it back only if it can still be played.
**Side effects:** one upsert or delete on `playback_state`; `loadPlaybackState` reads `tracks`.
**Before:** nothing. Closing a tab lost the queue and the position.
**After:** saving is an upsert keyed on `user_id`, which is the primary key — one row per user, so last-write-wins is enforced by the schema. Loading is the part with judgement in it. A queue is stored as ids and read back later, by which time tracks may have been deleted or flagged missing, so both are filtered out on read against the same `missing_since IS NULL` rule the browse queries use — a track hidden from the library table must not reappear through a resumed queue. Filtering means the stored index cannot be reused, so it is re-derived from the survivors. When the played track itself is gone the resume moves *forward* to the next survivor rather than back to the queue's start, and drops the position, which belonged to a track nobody is playing now. Returns `null` when nothing playable is left, since a resume into an empty queue is worse than no resume.

---

**Function:** `persistState()` / `stopAndForget()` — `frontend/src/components/PlayerBar.tsx`
**Date:** 2026-09-10
**How added:** new feature
**Purpose:** push the position often enough to be useful, and know the difference between quitting and being logged out.
**Side effects:** `PUT` / `DELETE` on `/me/playback-state`; holds an interval while playing.
**Before:** `stop()` did both jobs, and nothing was ever written.
**After:** `persistState` reads the live queue from a ref, so the interval and the `visibilitychange` listener never re-bind. It runs at three moments because none covers the others: every 10 s while playing (a killed tab loses one interval at most), whenever playback pauses or changes track, and on `visibilitychange` — chosen over `beforeunload`, which does not fire reliably on a phone, the one place a backgrounded tab actually gets killed. `stopAndForget` exists because the ✕ and a logout must not mean the same thing: the ✕ is a deliberate "I am done" and erases the saved position, while a token expiring must leave it exactly where it was. Only `stopAndForget` is exposed on the context; the logout effect calls the raw `stop`.

---

**Function:** `loadDataSaverPreference()` / `saveDataSaverPreference()` / `probeServedStream()` / `describeServed()` — `frontend/src/lib/streamQuality.ts`
**Date:** 2026-09-10
**How added:** new feature
**Purpose:** hold the data-saver preference, and find out what the server actually sent.
**Side effects:** reads/writes `localStorage`; `probeServedStream` issues one `Range: bytes=0-0` request.
**Before:** nothing. `buildStreamUrl` had taken a `quality` argument since `f3bd28d` and no caller ever passed one, so `?quality=low` was reachable only by hand-editing a URL.
**After:** the preference is per-device rather than per-account — the phone on mobile data wants it and the desktop on the LAN does not, and they share a login — so it lives in `localStorage`, wrapped in try/catch because storage can be blocked outright and a missing preference must not cost playback. `probeServedStream` exists because asking for the small copy is not the same as getting one: `variantFor` declines the downgrade when a source is already at or below the target, and an `<audio>` element exposes no response headers, so the fact is unreachable without a second request. A 206 carries both halves — `Content-Type` is the variant that was chosen, and `Content-Range` ends in the total size. It is nearly free on a cold cache, since the audio element is fetching the same variant at the same moment and the backend's in-flight map collapses the two into one transcode. `describeServed` measures the bitrate from the bytes on the wire rather than reading a tag, which keeps it honest for remuxed and re-encoded copies whose source numbers no longer apply.

---

**Function:** `setDataSaver()` / `waitForMetadata()` — `frontend/src/components/PlayerBar.tsx`
**Date:** 2026-09-10
**How added:** new feature
**Purpose:** flip quality on the track that is playing, not just on the next one.
**Side effects:** reassigns `audio.src`; writes the preference; leaves `progressRef` deliberately untouched.
**Before:** no data-saver control existed in either player surface.
**After:** the swap applies immediately, because a toggle that appears to do nothing for the rest of a four-minute track reads as broken. That is only possible because of the disk cache — the small copy is a complete file with a length, so it can be seeked back to the spot the listener was already at. Three things survive the swap: the position, the play/pause state, and the scrobble. The scrobble is the subtle one — this is the same listen, so `progressRef` is not reset, and `lastTime` is re-anchored to the resume point so the jump back up from 0 is not counted as time heard. `waitForMetadata` rejects on the element's `error` event rather than only resolving on `loadedmetadata`, so a swap that cannot happen surfaces as a toast instead of pinning the player on "loading" forever.

---

**Function:** `barsFromPeaks()` / `QUIET_TRACK_CEILING` — `frontend/src/components/NowPlaying.tsx`
**Date:** 2026-09-10
**How added:** change
**Purpose:** turn the server's stored peaks into the bar heights the phone scrubber draws.
**Side effects:** none — pure, called during render.
**Before:** divided each bar by 255, the magnitude of a full-scale sample. Honest and unreadable: this library peaks around 80, so every waveform drew in the bottom third of the scrubber — flatter than the random `placeholderHeights` fallback it replaces, which is the wrong way round.
**After:** scales each track to its own loudest bar, capped by a ceiling that rises with the track's actual loudness (`QUIET_TRACK_CEILING + (1 - QUIET_TRACK_CEILING) * loudest`, floor 0.55). A full-scale track may fill the height; a near-silent one may not pass 0.55, so quiet still reads as quiet. Guards `loudest === 0` so an all-silent track draws the existing 0.06 line instead of dividing by zero. Stored peaks stay absolute — the decision is about drawing, not about data, so no migration or re-decode. Measured track: 31% → 69% of height.

---

**Function:** `getOrCreate` / `cacheEntryName` / `evictIfOversized` / `cacheSizeBytes` — `backend/src/services/transcodeCache.ts`
**Date:** 2026-09-10
**How added:** new feature
**Purpose:** keep converted copies of tracks on disk so a converted track is an ordinary file.
**Side effects:** writes and deletes under `TRANSCODE_PATH`; holds a module-level in-flight map; drives ffmpeg through `encodeToFile`.
**Before:** nothing. `?quality=low` was a live encode with no length, so it could not be range-served, revalidated or seeked, and it re-encoded on every single play.
**After:** `cacheEntryName` names an entry from source size + mtime + variant id — the same pair the `ETag` trusts to mean "different file", so a replaced source misses and the stale entry ages out with no invalidation step to forget. `getOrCreate` returns a hit or produces one, deduping concurrent cold requests through an in-flight map (`waveform.ts` solves the identical race identically) and committing via temp-then-`rename`, which is atomic within a directory: a reader finds a whole file or none, never a truncated one that looks finished. That guard matters more here than usual, since transcodes are SIGKILLed on client disconnect by design. `evictIfOversized` drops least-recently-used entries after a write — the only moment the cache grows, so no timer is needed — reading mtime, which `getOrCreate` touches on every hit so it means "last used". It only ever considers names matching this module's own pattern, so pointing `TRANSCODE_PATH` at a shared directory cannot cost a stranger their files.

**Function:** `encodeToFile` / `LOW_QUALITY_VARIANT` / `REMUX_M4A_VARIANT` / `NoTranscodeSlotError` — `backend/src/services/streaming.ts`
**Date:** 2026-09-10
**How added:** new feature (replacing `transcodeToLowQuality`)
**Purpose:** produce a complete converted file, and describe the two conversions worth keeping.
**Side effects:** spawns ffmpeg; holds a transcode slot for the whole encode.
**Before:** `transcodeToLowQuality` returned a live stream that had to be killed by hand and could never be range-served.
**After:** `encodeToFile` resolves when the file is complete, holding a slot throughout so the same ceiling bounds cache fills as bounded live transcodes, and deleting whatever ffmpeg left behind on failure. `LOW_QUALITY_VARIANT` is the 64k Opus data-saver copy. `REMUX_M4A_VARIANT` uses `-c:a copy`, so it is a container change and not a re-encode — it exists because raw ADTS reports a duration ~50% long to both ffprobe and Chrome, which makes the seek bar lie. `NoTranscodeSlotError` is a distinct type so the route can answer 503 rather than failing obscurely. The live-stream path and its `?t=` offset parser were removed as unreachable.

**Function:** `variantFor` — `backend/src/routes/tracks.ts`
**Date:** 2026-09-10
**How added:** new feature
**Purpose:** decide whether a request should be served a converted copy, and which.
**Side effects:** none — a pure decision over the track row and the query.
**Before:** the route branched on `quality === 'low'` alone, so it converted unconditionally and never remuxed anything.
**After:** two independent reasons to convert. Data saver only when the source is far enough above the target to pay for a second lossy generation — a strict "above 64k" test would re-encode a 121 kbps Opus file for a measured 36% saving, so the floor is 1.5x target and an unknown bitrate converts rather than guesses. And raw `.aac` always, regardless of quality, because it has no reliable duration until it is in a real container.

---

**Function:** `config.maxUploadSizeMb` — `backend/src/config.ts`
**Date:** 2026-09-10
**How added:** change
**Purpose:** cap the size of a single uploaded file.
**Side effects:** read once when `@fastify/multipart` is registered, so it takes effect at app build, not per request.
**Before:** 100 MB, which predates the library accepting FLAC and WAV. A single hi-res FLAC exceeds it, so the upload route would have rejected two of the seven formats the scanner had just been taught to accept.
**After:** 1024 MB. Reasonable only because `POST /tracks/upload` is admin-only — the ceiling guards against a slip, not an attacker. Two non-obvious consequences are documented at the constant: the web client uploads 3 concurrently, so staging can hold ~3× this at once, and any reverse proxy in front has its own body limit that must be raised to match or it rejects first. The rejection path gained its first tests (`routes/upload.test.ts`), built against a 1 MB ceiling so they cost milliseconds instead of a gigabyte of I/O.

---

**Function:** `AUDIO_EXTENSIONS` / `MIME_TYPES` — `backend/src/services/trackTags.ts`, `backend/src/services/streaming.ts`
**Date:** 2026-09-10
**How added:** new feature
**Purpose:** decide what the library will ingest, and what content type it is served as.
**Side effects:** none — both are constants, but they gate the scanner, the upload route and the stream route.
**Before:** five extensions: `.flac`, `.opus`, `.mp3`, `.m4a`, `.ogg`. A `.wav` or `.aac` in the library was walked past in silence, and `mimeTypeFor` answered `application/octet-stream` for both.
**After:** seven, adding `.wav` and `.aac`. Nothing else needed changing — `music-metadata` and ffmpeg both handle the new pair — but that was verified against real fixtures rather than assumed, and the verification found the thing that matters: raw ADTS reports its duration as 37.9 s where frame-scanning gives 25.0 s, so the two must not be served raw once the transcode cache exists. The two constants also gained a test that walks `AUDIO_EXTENSIONS` and fails when an accepted extension has no MIME type, because the sets drift apart silently and the symptom is a format the scanner ingests but the browser downloads instead of playing.

---

**Function:** `parseStreamOffset` / `transcodeToLowQuality` — `backend/src/services/streaming.ts`
**Date:** 2026-09-10
**How added:** new feature
**Purpose:** start a data-saver stream partway into a track.
**Side effects:** `transcodeToLowQuality` spawns ffmpeg; `parseStreamOffset` is pure.
**Before:** the transcoded path had no length and no byte ranges, so there was no way back into the middle of a track — the scrubber was dead and a reconnect restarted the song.
**After:** `transcodeToLowQuality` takes an options object (`{ offsetSeconds, onError }`) and applies the offset with `.seekInput()`, which puts `-ss` *before* `-i` so ffmpeg jumps to the nearest packet rather than decoding and discarding everything ahead of it. `parseStreamOffset` validates `?t=`: absent is 0, negative and non-numeric and at-or-past-the-end are `'invalid'` — rejected rather than clamped, because silently starting somewhere the caller did not ask for makes the scrubber lie about where playback is. A null duration does not reject, since the scanner leaves it empty on files it could not measure. Verified byte-identical against a locally-seeked reference.

---

**Function:** `LibraryPage` / `buildQuery` — `frontend/src/pages/LibraryPage.tsx`
**Date:** 2026-09-10
**How added:** new feature
**Purpose:** let someone see, and act on, tracks whose file is gone.
**Side effects:** none beyond the query it issues.
**Before:** the backend filter existed but nothing reached it — the 11 dead rows on the real library were unreachable except by hand-editing a URL.
**After:** a fourth select in the existing filter row (**Playable only** / **All (incl. missing)** / **Missing only**), same three-way vocabulary and same control class as the `hidden` and `notRecommended` filters beside it, defaulting to `exclude` to match the server. Changing it resets to page 1, as the search box does. A red `badge-danger` marks a missing row — `hidden` and `not recommended` are choices someone made and stay neutral/caution, while this is a fault. The row's play button is disabled with an explaining `title`, and playing a good row builds its queue from playable tracks only: without that, "All (incl. missing)" would hand the player a queue that stalls on a `500` partway through. Verified in real headless Chromium against the live library — 19 / 11 / 30 rows across the three settings, 11 badges, 11 disabled play buttons and none enabled under "Missing only", no page errors.

**Function:** `TrackDetailDrawer` diagnostics — `frontend/src/components/TrackDetailDrawer.tsx`
**Date:** 2026-09-10
**How added:** new feature
**Purpose:** say whether a track's file is actually there.
**Side effects:** none.
**Before:** the drawer showed `Last stream error`, which only fills in after someone has already tried to play a dead track.
**After:** a **File on disk** row reading `Missing since <date>` in red, or `Present`. Backed by `missingSince` on the track detail shape. It is the proactive counterpart to the error row: one says "this failed once", the other says "this will fail".

---

**Function:** `nullabilityClause` / `buildTrackFilter` / `countArtists` / `listArtists` / `countAlbums` / `listAlbums` / `getAlbumDetail` / `getArtistDetail` / `searchWithFts` / `searchWithLike` — `backend/src/db/browse.ts`
**Date:** 2026-09-10
**How added:** change
**Purpose:** keep tracks whose file is gone out of every listing that offers something to play.
**Side effects:** none — read paths only.
**Before:** a flagged track still appeared in the library table, its album, its artist page and search results, and clicking it was a `500`. Albums and artists with nothing playable left still occupied the grid.
**After:** `nullabilityClause` is the counterpart to `visibilityClause` for a column that stores a date rather than a flag — "present" is `IS NULL`, not `= 0`. `buildTrackFilter` excludes missing tracks by default and honours `missing: 'only' | 'all'`, matching the vocabulary `hidden` and `notRecommended` already use, so an admin finds them in the ordinary listing rather than a separate screen. The artist and album summary selects now join tracks with the missing filter applied, so their counts describe what a listener can actually play, and the list/search call sites add `HAVING COUNT(DISTINCT t.id) > 0` so an emptied artist or album drops out entirely. Counts changed alongside their lists — a total the list can never reach is exactly the pagination bug `buildTrackFilter`'s own comment warns about. `getArtistDetail` and `getAlbumDetail` still resolve by id and simply come back empty: filtering a grid is one decision, 404-ing a URL someone already holds is a worse one. Playlists, favorites and play history are untouched on purpose — see the changelog entry.

**Function:** `listTopTracks` / `countTopTracks` — `backend/src/db/plays.ts`
**Date:** 2026-09-10
**How added:** change
**Purpose:** rank the most-played tracks.
**Side effects:** none.
**Before:** a track that was played a lot and then lost its file stayed at the top of the chart, unplayable.
**After:** both exclude `missing_since IS NOT NULL`, together, so the count and the list agree. `listHistoryForUser` / `listHistoryForTrack` were deliberately left alone: history records what happened, and hiding a play that genuinely occurred would be falsifying the log rather than tidying it.

---

**Function:** `reconcileMissingTracks` / `pathIsMissing` — `backend/src/services/scanner.ts`
**Date:** 2026-09-10
**How added:** new feature
**Purpose:** reconcile the database against the filesystem — flag tracks whose file has gone, clear ones that came back.
**Side effects:** stats every track path (32 at a time); writes `tracks.missing_since`.
**Before:** nothing watched for drift. A row pointing at a missing file was invisible until someone pressed play and got a `500`; eleven of the thirty rows in the real database were in that state.
**After:** marks, never deletes — those rows carry favorites and playlist entries for files that may still exist in a backup. `pathIsMissing` treats **only** `ENOENT` as missing: a permissions or I/O error means the file may well be there and we simply cannot see it, and marking on that would turn a mount hiccup into a library of false gravestones. The guard is the substance of the function: a library root that has not mounted looks exactly like a deleted library, so the sweep refuses and changes nothing when the root is unreadable, or when a single sweep would newly condemn both more than `abortRatio` of the library and at least three tracks. The floor exists because a pure ratio protects small libraries into uselessness — one file out of two is 50% — and being wrong below it is cheap, since the flag is reversible. Only newly-missing rows count toward the ratio, or a library that once lost half its files could never record the next deletion.

**Function:** `syncLibrary` / `startLibrarySyncSchedule` / `describe` / `isLibrarySyncRunning` — `backend/src/services/librarySync.ts`
**Date:** 2026-09-10
**How added:** new feature
**Purpose:** run scan and reconciliation on a timer, and keep two of them from running at once.
**Side effects:** spawns nothing, but drives the scanner, which writes a row per file; holds a module-level in-progress flag.
**Before:** nothing — scanning happened only when an admin pressed the button.
**After:** reconciliation at boot (cheap: one stat per track) and a full scan every `libraryScanIntervalHours`. The full walk is deliberately not run at startup, because `tsx watch` restarts on every save in development. A second caller while a sync is in flight is turned away rather than queued — the run already going is about to answer the same question, and two of them upserting the same paths is worse than waiting. Failures are logged and the schedule continues, on the same reasoning as backups: a server that stops serving music because it could not walk a directory has traded a small problem for a large one.

**Function:** `listTrackPaths` / `markTracksMissing` / `clearTracksMissing` / `countMissingTracks` / `listMissingTracks` — `backend/src/db/library.ts`
**Date:** 2026-09-10
**How added:** new feature
**Purpose:** read and write the `missing_since` flag added by migration `0010`.
**Side effects:** `markTracksMissing` / `clearTracksMissing` write, each in one transaction.
**Before:** nothing — the column did not exist.
**After:** `markTracksMissing` stamps only rows where `missing_since IS NULL`, so re-running a sweep cannot push the date forward and make a months-old absence look like today's. `clearTracksMissing` also clears `last_stream_error`, since a file that has come back should not keep showing the error from when it was gone. `listMissingTracks` orders oldest-absence-first — it is a worklist, not a log.

**Function:** `POST /library/scan` / `GET /library/missing` — `backend/src/routes/library.ts`
**Date:** 2026-09-10
**How added:** new endpoint + change
**Purpose:** run a sync on demand, and list the rows whose files are gone.
**Side effects:** the scan writes a row per file and reconciles.
**Before:** `POST /library/scan` called `scanLibrary` directly, with no reconciliation and nothing stopping two from overlapping.
**After:** both go through `syncLibrary`, so a scan arriving while one is running gets `409` instead of racing it. The response keeps the old `ScanSummary` shape at the top level with `reconcile` alongside, so existing callers are unaffected. `GET /library/missing` is admin-only and returns the flagged rows plus the current `libraryPath` — without it the list is hard to read, since the interesting case is rows pointing at a root the server no longer uses.

---

**Function:** `transcodeToLowQuality` — `backend/src/services/streaming.ts`
**Date:** 2026-09-10
**How added:** bug fix + hardening
**Purpose:** produce the low-bitrate Opus stream for the data-saver path, and give the caller a way to stop it.
**Side effects:** spawns ffmpeg; holds one of a fixed number of module-level transcode slots.
**Before:** returned a bare `NodeJS.ReadableStream` and discarded the ffmpeg command, so nothing could kill it. ffmpeg writes to a pipe, so an abandoned transcode did not die on its own — the pipe filled, ffmpeg blocked in `write`, and the process survived until the server restarted. One skipped track, one stranded process. There was also no ceiling: N clients meant N full-rate decodes on the machine serving the app.
**After:** returns a `TranscodeSession` (`{ stream, stop }`) or `null` when every slot is busy. `stop()` is idempotent, releases the slot, and SIGKILLs — not SIGTERM, because a process blocked writing to a full pipe is the case this exists to clean up and does not reliably act on a catchable signal there. The kill is re-issued on ffmpeg's `start` event if a stop already landed: spawning is asynchronous, so a stop arriving first has nothing to signal and would otherwise orphan the process that spawns a moment later. Returning `null` rather than falling back to the original file is deliberate — the caller asked for the small copy for a reason.

**Function:** `buildETag` / `isNotModified` / `ifRangeAllowsRange` — `backend/src/services/streaming.ts`
**Date:** 2026-09-10
**How added:** new feature
**Purpose:** let a client revalidate a cached track instead of re-downloading it, and keep a resumed range honest.
**Side effects:** none — pure functions over headers and `stat` output.
**Before:** nothing. The stream endpoint sent no validators at all, so every replay of a song was a full re-download.
**After:** `buildETag` derives a **strong** tag from size + mtime (the nginx pair). Strong matters: a weak tag may not validate an `If-Range`, so a weak one would have quietly disabled resumable seeking. `isNotModified` implements RFC 9110 precedence — `If-None-Match` decides alone when present, weakly compared; `If-Modified-Since` is consulted only in its absence and compared at whole seconds, since HTTP dates carry no sub-second part and a file written 400 ms later must not read as newer. `ifRangeAllowsRange` gates the range: absent means the client claimed nothing and the range stands; a mismatch means the file changed underneath, and splicing new bytes onto old ones would hand the decoder a corrupt stream disguised as a successful `206`.

**Function:** `getHealthSnapshot` / `resetStreamMonitor` — `backend/src/services/streamMonitor.ts`
**Date:** 2026-09-10
**How added:** bug fix
**Purpose:** report whether the streaming path is currently healthy.
**Side effects:** none; `resetStreamMonitor` clears module state and exists for tests.
**Before:** `status` was `degraded` whenever the error ring was non-empty, and the ring is only trimmed by length — so a single missing file at boot left the server reporting degraded permanently, which carries the same information as reporting nothing.
**After:** the verdict expires fifteen minutes after the last error; the errors stay listed, because the history is the useful part of a diagnostics page. Takes an optional `now` so the window is testable without waiting for it. Also reports `activeTranscodes`, so the new concurrency ceiling is observable rather than inferred.

**Function:** `GET /tracks/:id/stream` — `backend/src/routes/tracks.ts`
**Date:** 2026-09-10
**How added:** bug fix + hardening
**Purpose:** serve audio bytes.
**Side effects:** reads from disk; may spawn ffmpeg; moves the active-stream gauge.
**Before:** no cache validators, so every play refetched the whole file. Transcodes were started and never stopped. `streamStarted()` fired before the `416` check, so a rejected range counted as a stream.
**After:** the direct path sends `ETag`, `Last-Modified` and `Cache-Control: private, max-age=86400`, answers `304` to a matching validator, and drops a `Range` whose `If-Range` no longer matches rather than serving a spliced `206`. A day, not a week: long enough for an evening of listening and every seek inside a track, short enough that replacing a file cannot keep serving the old rip — and the media token in the URL rotates every two hours anyway, so a longer window buys little. The data-saver path takes a slot or returns `503` + `Retry-After`, sends `no-store` (its length is unknown until the encode ends, so there is nothing to validate against), and calls `session.stop()` on response close. The stream gauge now moves only for responses that actually carry audio.

---

**Function:** `computePeaks` / `peaksForTrack` / `decodePeaks` — `backend/src/services/waveform.ts`
**Date:** 2026-09-09
**How added:** new feature
**Purpose:** turn an audio file into 128 peak amplitudes for the player's scrubber.
**Side effects:** spawns ffmpeg; writes `tracks.waveform`; holds a module-level map of in-flight decodes.
**Before:** nothing. The scrubber drew a shape hashed from the track id — stable, but not the audio.
**After:** ffmpeg decodes to mono 16-bit PCM and the stream is reduced to byte-ranged peaks. Three decisions carry it. **44.1 kHz**, which looks wasteful for 128 buckets and is not: resampling lowpasses on the way down and the peak of a lowpassed signal is not the peak of the signal — a full-scale 5 kHz tone measures `0.9998` at 44.1 kHz and `0.059` at 1 kHz, so a cheap decode drew anything bright as near-silent. **Buckets sized from the stored duration**, so memory is flat however long the track is; the alternative, buffering the decode to count samples first, costs tens of megabytes on a long mix, and overflow folds into the last bucket so a short duration gives a hot final bar rather than a truncated waveform. **Failures are not cached** — the usual cause is a file mid-copy or moved, and both fix themselves. `peaksForTrack` dedupes concurrent decodes of the same track, because opening the player and reloading it otherwise race to write the same row.

**Function:** `GET /tracks/:id/waveform` — `backend/src/routes/tracks.ts`
**Date:** 2026-09-09
**How added:** new endpoint
**Purpose:** serve the scrubber its peaks.
**Side effects:** first call for a track decodes the file and writes the row.
**Before:** n/a.
**After:** returns `{ peaks: number[] }`, 0-255, or 404 when a track cannot be analysed — a placeholder case for the client, not an error worth showing anyone. Cached a day at the client, since peaks only change if the file does and a changed file is a new scan.

**Function:** `NowPlaying` / `barsFromPeaks` / `placeholderHeights` — `frontend/src/components/NowPlaying.tsx`
**Date:** 2026-09-09
**How added:** new component
**Purpose:** a full-screen player for phones.
**Side effects:** two queries per track (detail, waveform).
**Before:** the bar was desktop-only markup with no breakpoints — on a phone it squeezed transport, scrubber, title and queue position into one strip.
**After:** takes the player context as a **prop** rather than calling `usePlayer`, which would make this file and `PlayerBar` import each other at runtime; the provider builds the value once and passes the same object to both. `barsFromPeaks` downsamples 128 → 44 by **maximum** per span, not average — averaging pulls everything toward the middle and flattens exactly the transients that make a waveform recognisable. `placeholderHeights` survives as the pending/unavailable state, still hashed from the track id so a shape that cannot be drawn stays put instead of reshuffling every render, which would read as broken rather than as loading.

**Function:** `PlayerProvider` — mobile split and session teardown — `frontend/src/components/PlayerBar.tsx`
**Date:** 2026-09-09
**How added:** change
**Purpose:** one player, two presentations; and playback that belongs to a session.
**Side effects:** `stop()` now also closes the expanded view.
**Before:** one fixed bar at all widths. The provider sits above the router, so the queue survived logout — the bar kept playing the previous user's library over the login screen.
**After:** below `md` the bar is a tappable strip that opens `NowPlaying`; the desktop bar is unchanged behind `md:block`. An effect tears the audio down whenever there is no user, which covers a token expiring as well as an explicit log out, and the bar is not painted without one so it cannot flash in the render before the queue clears. `stop` became a stable callback so that effect can depend on the session rather than re-firing every render. `goTo` moved onto the context — it already existed internally, and exposing it is what lets a queue row jump to its track.

**Function:** `BrandMark` / `Wordmark` / `BrandLockup` — `frontend/src/components/BrandLockup.tsx`
**Date:** 2026-09-09
**How added:** new component, then split
**Purpose:** one brand lockup, composed per surface.
**Side effects:** none.
**Before:** an orange rounded square with a `b` in it, duplicated between the auth pages and the app header.
**After:** a ringed mark and a two-tone wordmark, exported separately so each surface composes them in its own colours — the auth pages keep the hero version on white, the header assembles a 28px one on navy. Drawn in markup rather than imported as an image: it is two circles and a line of type, so an SVG would only cost a request and go fuzzy when scaled. The dot stays orange in both, being the one accent that reads on either ground.

**Function:** `WordmarkColumn` — `frontend/src/components/WordmarkColumn.tsx`
**Date:** 2026-09-09
**How added:** extracted from `TitleScreenPanel`
**Purpose:** the wordmark set on its side, climbing forever.
**Side effects:** none.
**Before:** inline in the title screen, sized for that panel only.
**After:** shared by the login panel at poster scale and the app frame as ambient gutter texture. Pass length is in **beats**, not seconds, so every column shares the `--beat` clock with the rest of the screen. Renders two copies and shifts by exactly one, so the loop seam lands on an identical frame whatever the type happens to measure — the earlier version forced each block to be panel-height, which is why the type had to leave headroom.

**Function:** `backupDatabase` / `pruneBackups` / `listBackups` / `startBackupSchedule` — `backend/src/services/backup.ts`
**Date:** 2026-09-09
**How added:** new feature (roadmap step 14)
**Purpose:** keep recoverable copies of the only irreplaceable data in the project.
**Side effects:** writes and deletes files under `config.backupPath`; opens a second connection to each new backup file to verify it.
**Before:** nothing. A corrupt database, a bad migration or an `rm` meant losing playlists, favorites and play history permanently.
**After:** a verified backup at server start and every 24h, retaining 14. Three decisions carry the module: SQLite's **online backup API** rather than a file copy, because WAL mode makes `cp` capable of producing a database that opens fine and is missing recent writes; **`journal_mode = delete` on the copy**, so each backup is one self-contained file rather than a `.db` plus sidecars that retention never pruned and that corrupt a restore if a stale one is left behind; and **`integrity_check` before the backup counts**, because an unread backup is a guess. Pruning matches only this module's filename pattern, so a shared `BACKUP_PATH` cannot lose a stranger's files. Failures log and continue — refusing to serve music because a backup failed trades a small problem for a large one.

**Function:** `isRegistrationOpen` — `backend/src/routes/auth.ts` (+ `config.allowOpenRegistration`)
**Date:** 2026-09-09
**How added:** new feature
**Purpose:** decide whether an anonymous caller may create an account.
**Side effects:** none; read by both `/auth/registration-status` and the `/auth/register` preHandler so the two can never disagree.
**Before:** the gate was `countUsers() === 0` inline in two places — registration was admin-only except for the bootstrap account.
**After:** `config.allowOpenRegistration || countUsers() === 0`, the env var defaulting to open. The empty-table clause is not a policy choice but a deadlock break: admin-only registration plus no admin has no way out. `/auth/registration-status` now also returns `firstAccount`, because "claim this server and become admin" and "sign up as a listener" are different yeses and the pages must not promise the wrong one. Read at call time, not import time, so tests can pin it.

**Function:** `POST /auth/register` validation — `backend/src/routes/auth.ts`
**Date:** 2026-09-09
**How added:** hardening
**Purpose:** stop trusting the browser once anyone can reach the endpoint.
**Side effects:** none.
**Before:** only presence of `username`/`password` was checked; the 8-character floor lived in the React form.
**After:** enforces `MIN_PASSWORD_LENGTH` and `USERNAME_PATTERN` (`[A-Za-z0-9._-]{2,32}`) server-side, returning 400. With open registration the form is no longer a gate.

**Function:** `POST /library/scan` — `backend/src/routes/library.ts`
**Date:** 2026-09-09
**How added:** hardening
**Purpose:** keep a disk-walking operation out of reach of strangers.
**Side effects:** none beyond the scan itself.
**Before:** `preHandler: fastify.authenticate` — any signed-in account could trigger a full library scan.
**After:** `[authenticate, requireAdmin]`. Harmless while every account came from an admin; with open sign-up it was a free way to hammer the server. Surfaced by a test asserting self-serve accounts hold no admin powers.

**Function:** `PlayIcon` / `PauseIcon` / `SkipBackIcon` / `SkipForwardIcon` — `frontend/src/components/icons.tsx`
**Date:** 2026-09-09
**How added:** new feature (bug fix)
**Purpose:** replace text glyphs that the system emoji font was rendering as coloured tiles.
**Side effects:** none.
**Before:** `⏮ ▶ ❚❚ ⏭` as text. U+23EE/U+23ED default to emoji presentation, so they ignored `text-*` colour and sized themselves off font metrics rather than the button box.
**After:** inline SVG on a 24 viewBox, `fill="currentColor"`, sized by the caller — so hover and disabled states come from the button. Used in the player bar and the six other places the `▶` glyph appeared.

**Function:** `usersRoute` — `backend/src/routes/users.ts` (+ `listUsers`, `countAdmins`, `setAdminById`, `setPasswordHashById`, `deleteUser` in `db/users.ts`)
**Date:** 2026-09-09
**How added:** new feature
**Purpose:** admin user management from the browser instead of SSH and a CLI script.
**Side effects:** writes to `users`; deleting a user cascades to their favorites, playlists and play history.
**Before:** roles and passwords could only be changed by running `npm run set-admin` / `set-password` on the server.
**After:** `GET /users`, `PATCH /users/:id` (role and/or password), `DELETE /users/:id`, all admin-gated. **Two guards are the point of the module**: demoting or deleting the last admin returns 409, and you cannot delete yourself — otherwise an admin can lock the installation out of user management from a browser, recoverable only from a terminal. Account *creation* deliberately stays on `POST /auth/register` so there is one path that makes a user.

**Function:** `GET /auth/registration-status` — `backend/src/routes/auth.ts`
**Date:** 2026-09-09
**How added:** new feature
**Purpose:** let the signup page know whether it may act.
**Side effects:** none.
**After:** returns `{ open }`, true only while the user table is empty. Unauthenticated by necessity — the page has to ask before anyone can log in. The one bit it leaks ("has this server been set up") isn't worth protecting.

**Function:** `SignupPage` / `UsersPage` — `frontend/src/pages/`
**Date:** 2026-09-09
**How added:** new feature
**Purpose:** create accounts without a terminal.
**Before:** nothing — the login page just said "ask an admin".
**After:** `SignupPage` branches on the server's registration status rather than guessing, and signs the new owner straight in. `UsersPage` creates via `/auth/register` then optionally `PATCH`es admin, so creation has a single code path. Both surface the server's 409 lockout guards as ordinary toasts.

**Function:** `getDb()` / `isDatabaseOpen()` / `closeDb()` and the `db` proxy — `backend/src/db/connection.ts`
**Date:** 2026-09-09
**How added:** changed
**Purpose:** stop importing a module from opening a database.
**Side effects:** `getDb()` creates the parent directory, opens the handle and sets WAL — on first call, not on import.
**Before:** `export const db = new Database(config.dbPath)` ran at module scope, so any import that transitively reached `db/` created and touched whatever `DB_PATH` pointed at. That is the shape of both filesystem incidents this project has had.
**After:** a `Proxy` resolves every property through `getDb()`, so the ~90 `db.prepare(...)` call sites are unchanged. Methods are bound to the real handle — better-sqlite3 breaks with a detached receiver. `isDatabaseOpen()` exists so a test can assert the deferral rather than assume it.

**Function:** `recordScrobble()` — `backend/src/db/plays.ts`
**Date:** 2026-09-09
**How added:** changed
**Purpose:** same behaviour, without opening the connection at import.
**Before:** `export const recordScrobble = db.transaction(...)` evaluated at module scope, which opened the handle as a side effect of importing the file — defeating the lazy connection for everything downstream.
**After:** the transaction is built on first call and memoised. Behaviour is identical; only the timing changed.

**Function:** `POST /auth/register` gate — `backend/src/routes/auth.ts` (+ `countUsers()` in `db/users.ts`)
**Date:** 2026-09-09
**How added:** changed (breaking for anonymous callers)
**Purpose:** close an endpoint that let anyone with network access create an account.
**Side effects:** the bootstrap account is promoted to admin.
**Before:** no `preHandler` at all.
**After:** admin-only, except while the user table is empty — that first request is allowed and its account made an admin, because otherwise a fresh install can never create one. The preHandler is composed by hand since the gate is conditional, and uses `request.user` rather than `reply.sent` to detect that `authenticate` already answered: calling `requireAdmin` after a sent 401 would attempt a second reply.

**Function:** `registerSpa()` — `backend/src/plugins/spa.ts`
**Date:** 2026-09-09
**How added:** new feature
**Purpose:** serve the built web app from the API's own origin, so the container is useful by itself.
**Side effects:** registers `@fastify/static` and replaces the not-found handler. No-op when `FRONTEND_PATH` is unset or has no `index.html`, which is local dev.
**Before:** the backend was API-only; the SPA needed separate hosting.
**After:** static files plus an `index.html` fallback for client-side routes — but only for `GET` requests whose `Accept` includes `text/html`. An API call that 404s still receives JSON, because a `fetch()` handed an HTML page instead of `{ error }` fails in a far more confusing way. Registered after every API route so it only sees what nothing else claimed.

**Function:** API route registration — `backend/src/app.ts` (`API_PREFIX`)
**Date:** 2026-09-09
**How added:** changed (breaking)
**Purpose:** stop the API and the web app fighting over the same URLs.
**Before:** routes were registered at the root, so `/albums`, `/artists`, `/playlists`, `/search` and `/health` existed in both the API and the SPA. The API answered first, and a browser navigating to `/albums` got 401 JSON instead of the page.
**After:** all API routes register inside one child context with `{ prefix: '/api' }`. Fastify decorators (`authenticate`, `requireAdmin`) propagate into the child scope, so nothing else changed. Callers updated: the frontend's `API_BASE_URL`, the container `HEALTHCHECK`, `api.test.ts`, and the three legacy `*.html` pages.

**Function:** `makeTempDir()` / `resetDatabase()` / `assertIsolatedEnvironment()` — `backend/src/testing/harness.ts`
**Date:** 2026-09-09
**How added:** new feature
**Purpose:** make it structurally impossible for a test to touch real data.
**Side effects:** `resetDatabase()` migrates once per process then empties every table, children first (FKs are enforced). `assertIsolatedEnvironment()` throws — and runs on import, so a suite cannot forget it.
**Before:** nothing. Test isolation depended on remembering to run `npm test`; on 2026-09-09 that assumption failed and deleted the owner's music library.
**After:** `npm test` points DB_PATH/LIBRARY_PATH/ARTWORK_PATH/UPLOAD_STAGING_PATH at `backend/.test-tmp/`, and the harness refuses to load if any of them points elsewhere. `makeTempDir()` returns a directory and its cleanup so tests delete only what they created — the rule is that a test never removes a path it did not make.

**Function:** `runMigrations()` — `backend/src/db/migrator.ts`
**Date:** 2026-09-09
**How added:** extracted from `db/migrate.ts`
**Purpose:** apply pending migrations, callable in-process.
**Side effects:** writes to `schema_migrations` and executes migration SQL.
**Before:** the logic lived as top-level statements in `migrate.ts`, so the only way to run it was to execute that file.
**After:** `migrate.ts` is a thin CLI over it, and the test harness builds a schema without shelling out. `silent` suppresses per-migration logging, since the harness calls it before every suite. Returns the list of newly applied files.

**Function:** `fileIntoLibrary()` / `scanLibrary()` — signature change
**Date:** 2026-09-09
**How added:** changed
**Purpose:** remove the implicit filesystem root.
**Before:** both read `config.libraryPath` internally, so what they touched depended on ambient environment. That is what let a test's `rm -rf` reach real data.
**After:** both take `libraryRoot` as their first parameter; `routes/tracks.ts` and `routes/library.ts` pass `config.libraryPath` explicitly. Now standing convention — see `.docs/CLAUDE.md`.

**Function:** `inspectJwtSecret()` / `formatSecretProblem()` — `backend/src/utils/secretPolicy.ts`
**Date:** 2026-09-09
**How added:** new feature
**Purpose:** stop the server booting on a signing secret that isn't safe for a real deployment.
**Side effects:** none — pure. Called once from `src/index.ts`, which owns the `process.exit(1)`.
**Before:** `JWT_SECRET` silently fell back to `'change-me'`, a value committed to this repository.
**After:** returns `null` when the secret is fine, otherwise `{ summary, fatal }`. **Fails closed** — only `development` and `test` are lenient, so an unset `NODE_ENV` refuses rather than passes; that is the whole point, since `npm start` on an unconfigured host is the case being guarded. Rejects a secret under 32 characters as well as the default, because `JWT_SECRET=music` is equally compromised and merely looks configured. Takes the raw environment values rather than `config`, which has already applied the fallback and so cannot tell "unset" from "set to the default". Lives in `index.ts` rather than `config.ts` deliberately: `migrate` and the admin CLI scripts never sign a token, and blocking them would be a confusing failure with no benefit.

**Function:** `buildMatchQuery()` — `backend/src/utils/ftsQuery.ts`
**Date:** 2026-09-09
**How added:** new feature
**Purpose:** turn raw search-box input into an FTS5 MATCH expression, or say that the index can't answer it.
**Side effects:** none — pure. Deliberately imports nothing from `db/`, so it stays safe to unit-test (`db/connection.ts` opens the database at import time).
**Before:** nothing — search was a `LIKE '%x%'` scan with no query language to build for.
**After:** every term is wrapped in double quotes with embedded quotes doubled, so a typed `AND`, `NEAR/2`, `*`, `^` or `(` reaches the parser as text rather than syntax. Terms are ANDed, not concatenated into one phrase, so "beatles abbey" matches both anywhere. Returns `null` when any term is under 3 characters — the trigram floor — which is the caller's signal to fall back to LIKE rather than return nothing. Length is measured in code points, not UTF-16 units, so a two-emoji term counts as 2.

**Function:** `searchLibrary()` / `searchWithFts()` / `searchWithLike()` — `backend/src/db/browse.ts`
**Date:** 2026-09-09
**How added:** rewritten (was a LIKE scan)
**Purpose:** the `GET /search` backend.
**Side effects:** read-only.
**Before:** three `LIKE '%q%'` queries; tracks matched on title alone.
**After:** dispatches on `buildMatchQuery()` — FTS5 when the index can answer, the old LIKE path when it can't. Track results are ranked with `bm25(tracks_fts, 10.0, 5.0, 3.0)` so a title hit outranks an artist hit outranks an album hit; tracks therefore JOIN the index directly rather than using an `IN (...)` subquery, because ranking needs the auxiliary function over the matched rows. Artists and albums stay alphabetical — with at most 20 name matches, predictable beats ranked. The LIKE fallback now searches title/artist/album like the FTS path, so behaviour doesn't change with query length.

**Function:** `GlobalSearch` — `frontend/src/components/GlobalSearch.tsx`
**Date:** 2026-09-09
**How added:** new feature
**Purpose:** the header search box.
**Side effects:** navigates to `/search?q=…`.
**Before:** nothing. `GET /search` had existed since the backend landed with no caller.
**After:** submitting navigates rather than holding results in local state, so a search is a real URL — shareable, bookmarkable, survives a reload. The input mirrors `?q=` during render (compared against the last seen value rather than synced in an effect) so arriving from a link or the back button fills the box. `/` focuses it, ignored while typing in any field, matching the player's existing keyboard convention.

**Function:** `recordListenedTime()` / `scrobble()` / `scrobbleThresholdMs()` — `frontend/src/components/PlayerBar.tsx`
**Date:** 2026-09-09
**How added:** new feature
**Purpose:** decide when a play counts, and tell the backend once it does.
**Side effects:** `POST /tracks/:id/scrobble`; invalidates the `['tracks']` and `['track', id]` caches so the new count reaches the screen.
**Before:** nothing called the scrobble endpoint. `play_history` and `tracks.play_count` had been collecting zeros since the backend landed.
**After:** progress lives in a ref (`progressRef`) rather than state, so the audio element's long-lived listeners see live values without re-binding on every `timeupdate` — the same reason the `ended` handler is bound the way it is. Time is accumulated from `timeupdate` deltas and any delta over `MAX_PLAYBACK_DELTA_SECONDS` (2s) is dropped as a seek, so skipping ahead can't fake a listen. Threshold is `min(duration / 2, 240s)`, re-derived on `loadedmetadata` because the scanner's duration can be missing or wrong. `scrobbled` is set **before** the request so a slow response can't double-count, and `load()` resets the whole ref so a repeat-one restart correctly counts as a second listen. Errors are swallowed on purpose — a lost statistic must never interrupt playback.

**Function:** `PlaylistDetailPage` reorder flow (`handleDrop` + `reorderMutation`) — `frontend/src/pages/PlaylistDetailPage.tsx`
**Date:** 2026-09-08
**How added:** new feature
**Purpose:** drag-to-reorder backed by `PATCH /playlists/:id/tracks/reorder`.
**Side effects:** optimistic write to the `['playlist', id]` cache, then the request; rollback on failure.
**Before:** nothing — playlists had no UI at all.
**After:** the order is held **only** in the TanStack cache. `handleDrop` computes the new id array from the cached list and hands it to the mutation, which writes it optimistically and rolls back on error. Deliberately no `useState` copy of the order: two sources of truth for the same list is exactly the bug this shape avoids. Uses native HTML5 drag events — `onDragOver` must call `preventDefault()` or the drop never fires, which is the usual trap. Verified by dragging with a real mouse and confirming the order after a reload, not just in the DOM.

**Function:** `AddToPlaylistDialog` — `frontend/src/components/AddToPlaylistDialog.tsx`
**Date:** 2026-09-08
**How added:** new feature
**Purpose:** the only path for getting a track into a playlist — reached from the ⋮ menu on a library row.
**Side effects:** `POST /playlists` and/or `POST /playlists/:id/tracks`; invalidates playlist queries.
**Before:** nothing.
**After:** lists existing playlists, or creates one and adds the track in a single action. A 409 (already present) is caught by status and reported as "Already in that playlist" rather than surfaced as an error — the user's intent is satisfied either way.

**Function:** `listFavoriteTrackIdsForUser()` — `backend/src/db/favorites.ts` (+ `GET /me/favorites/ids`)
**Date:** 2026-09-08
**How added:** new feature
**Purpose:** lets any view render favorite state without the browse endpoints carrying an `isFavorited` column.
**Side effects:** none — a single indexed read.
**Before:** nothing. A client could star and unstar, and list its favorites, but could not tell whether an arbitrary track was favorited without fetching the whole list.
**After:** ids only, so the payload stays small and one client-side cache entry serves the library table, album pages and the player bar. Chosen over adding `isFavorited` to six browse queries (invasive, needs a user id threaded through each) and over paging the full favorites list per view (wasteful, and wrong past the first page).

**Function:** `useFavoriteIds()` / `FavoriteButton` — `frontend/src/components/FavoriteButton.tsx`
**Date:** 2026-09-08
**How added:** new feature
**Purpose:** the heart control and the shared favorite-state cache behind it.
**Side effects:** `PUT`/`DELETE /tracks/:id/favorite`; invalidates the ids and list queries.
**Before:** nothing — favorites had no UI.
**After:** every heart reads one query key, so toggling in the player bar updates the matching library row without a refetch. Optimistic with rollback; safe because both endpoints are idempotent. **The `enabled: Boolean(getToken())` guard is load-bearing** — the hook is called from `PlayerProvider`, which wraps the login route, so without it the query fires unauthenticated and `apiClient.request()` clears the stored token on the resulting 401.

**Function:** `storeArtwork()` / `thumbnailPathFor()` / `sendCover()` / `isValidArtworkId()` — `backend/src/services/artwork.ts`
**Date:** 2026-09-08
**How added:** new feature
**Purpose:** the cover-art cache — store embedded images, generate thumbnails, serve them with correct caching headers.
**Side effects:** writes under `ARTWORK_PATH`; `thumbnailPathFor` shells out to ffmpeg on a cache miss. Deliberately **no database access** — see the note below.
**Before:** nothing — the project had no artwork handling at all.
**After:** images are content-addressed (`<sha256>.<ext>`), so identical covers across an album's tracks collapse to one file and re-scans don't rewrite. Both writes are write-then-rename, so a concurrent reader never sees a partial file. `sendCover` uses the artwork id as the ETag — sound because the id *is* the content hash — and answers a matching `If-None-Match` with 304 without touching the disk. `isValidArtworkId` is the security-relevant one: ids come from the database but end up joined into a filesystem path, so the `<64-hex>.<ext>` shape is enforced rather than assumed.

**Function:** `persistArtwork()` — `backend/src/services/artworkIngest.ts`
**Date:** 2026-09-08
**How added:** new feature
**Purpose:** the one place both ingest paths (scanner, upload) store a cover and point the track — and, if unset, its album — at it.
**Side effects:** filesystem write plus two DB updates. Swallows its own errors: a cover that won't write shouldn't fail the import of a good audio file.
**Before:** briefly lived in `services/artwork.ts`.
**After:** moved into its own module so `artwork.ts` stays free of `db/` imports. That matters more than it looks: `db/connection.ts` opens the configured SQLite file **as an import side effect**, so a unit test importing anything in that chain opens the real database. The first version of `artwork.test.ts` did exactly that and checkpointed the live WAL away (no data lost, but it should never have happened). Verified after the split by comparing the database mtime across a full `npm test` run — unchanged.

**Function:** `CoverArt` — `frontend/src/components/CoverArt.tsx`
**Date:** 2026-09-08
**How added:** new feature
**Purpose:** renders a cover with a placeholder fallback, sized by the caller.
**Side effects:** mints/reuses a media token via `buildCoverUrl`.
**Before:** nothing — no artwork in the UI.
**After:** placeholder and image occupy the same box so a list doesn't reflow as covers resolve; a 404 (track has no art) is an expected outcome that renders the placeholder, not an error. State is stored as a single `{key, url, failed}` object compared against the current props during render, rather than reset synchronously inside the effect — that avoids the `set-state-in-effect` cascade the linter flags.

**Function:** `PlayerProvider` — `frontend/src/components/PlayerBar.tsx`
**Date:** 2026-09-08
**How added:** new feature
**Purpose:** the app's real player — queue, seek, transport, repeat, shuffle, keyboard control.
**Side effects:** owns one `Audio` element; `toggleShuffle()` issues `POST /shuffle`; each track change issues a media-token mint if the cached one is stale.
**Before:** `PreviewPlayerProvider` — one track at a time, play/pause/stop only, no queue and no seeking (it played a fully-downloaded blob).
**After:** `playQueue(tracks, startIndex)` enqueues a whole list; `ended` auto-advances, honouring repeat. Two implementation notes worth keeping: the `ended` handler is re-bound on `[queue, index, repeat]` rather than captured once at mount, otherwise it would advance using the values present when the player first rendered; and `originalQueueRef` holds the pre-shuffle order so un-shuffling restores it instead of leaving the queue permanently scrambled.

**Function:** `signMediaToken()` / `verifyMediaToken()` / `verifySessionToken()` / `tokenExpiresAt()` — `backend/src/services/token.ts`
**Date:** 2026-09-08
**How added:** new feature
**Purpose:** a second, deliberately weaker credential type for URLs that a browser element loads on its own (`<audio src>`, and `<img src>` for cover art later), which cannot send an Authorization header.
**Side effects:** none — pure sign/verify over the existing `JWT_SECRET`.
**Before:** only `signToken()` existed, and verification was inlined in the `authenticate` decorator.
**After:** media tokens carry `scope: 'media'` and expire in `config.mediaTokenTtl` (default `2h` vs the session's `7d`). The scope is enforced symmetrically — `verifySessionToken` throws on any scoped token, `verifyMediaToken` throws on an unscoped one — so neither type can stand in for the other. That symmetry is the security property worth protecting: without it, a stream URL in a browser history or access log would be a full API credential. Covered by `services/token.test.ts`.

**Function:** `fastify.authenticateMedia` — `backend/src/plugins/auth.ts`
**Date:** 2026-09-08
**How added:** new feature
**Purpose:** preHandler for `GET /tracks/:id/stream` — the one route a browser loads by URL alone.
**Side effects:** sets `request.user` exactly like `authenticate`.
**Before:** the stream route used `fastify.authenticate`, so playback from a browser required fetching the whole file as an authenticated blob first.
**After:** tries the bearer header first (Android and curl paths unchanged), then falls back to a `?token=` media token. Deliberately a *separate* decorator rather than a change to `authenticate` — only this route should ever accept a credential from a URL.

**Function:** `getMediaToken()` / `buildStreamUrl()` — `frontend/src/lib/apiClient.ts`
**Date:** 2026-09-08
**How added:** new feature
**Purpose:** builds a `<audio src>`-ready stream URL, caching the media token across tracks.
**Side effects:** issues `POST /auth/media-token` when the cache is cold or within a minute of expiry; `setToken()` clears the cache.
**Before:** `fetchStreamBlob()` downloaded the entire track and handed `<audio>` an object URL — no progressive streaming, no seeking, first note delayed by the full download.
**After:** `<audio>` fetches the URL itself, so the browser does byte-range streaming natively. Concurrent callers share one in-flight mint via `inFlightMediaToken` — without that, a list rendering many covers would fire a mint request per element.

**Function:** `cors` registration — `backend/src/app.ts`
**Date:** 2026-09-03
**How added:** bug fix
**Purpose:** allow `PATCH`/`PUT`/`DELETE` requests from a browser, not just `GET`/`POST`.
**Side effects:** none beyond the CORS preflight response headers.
**Before:** `app.register(cors, { origin: true })` — relied on `@fastify/cors`'s default `methods`, which is actually `'GET,HEAD,POST'` (not the full REST set, despite looking like it should be). Every `PATCH`/`PUT`/`DELETE` route (favorites, playlists, and the new track-management endpoints) was silently unusable from any real browser — curl-based testing never caught it since CORS is browser-enforced only.
**After:** `methods: ['GET','HEAD','POST','PUT','PATCH','DELETE']` set explicitly. Found via a real headless-Chromium `PATCH /tracks/:id` call failing with a CORS preflight error while building `TrackDetailDrawer`.

**Function:** `TrackDetailDrawer` save flow — `frontend/src/components/TrackDetailDrawer.tsx`
**Date:** 2026-09-03
**How added:** new feature
**Purpose:** the drawer's Tags-tab save button, via a TanStack `useMutation` wrapping `PATCH /tracks/:id`.
**Side effects:** on success, both `queryClient.setQueryData(['track', id], ...)` (so the drawer reflects the save immediately without a refetch) and `invalidateQueries({ queryKey: ['tracks'] })` (so `LibraryPage`'s list picks up the change) run together — missing either one would leave the drawer or the table showing stale data after a save.
**Before:** nothing — new component.
**After:** fields disable (not hide) when `!isAdmin`, matching the Interior spec's "still viewable, not editable" choice for non-admins.

**Function:** `fetchStreamBlob()` — `frontend/src/lib/apiClient.ts`
**Date:** 2026-09-03
**How added:** new feature
**Purpose:** loads a track's audio for the preview player as an authenticated `Blob`, converted to an object URL by `PreviewPlayerBar` — not a direct `<audio src="...">` pointed at the stream endpoint.
**Side effects:** one `fetch()` per track with an `Authorization` header attached.
**Before:** nothing — new function. The Interior-phase plan had assumed `<audio src>` would work directly.
**After:** `<audio>` can't send custom headers, and this backend's `authenticate` decorator only reads the `Authorization` header (no `?token=` fallback — see `.docs/STATUS.md`'s prior test-harness notes). Blob-fetch avoids putting a bearer token in a URL. Trade-off: loses native HTTP range-request progressive streaming — the whole file downloads before playback starts, acceptable for this app's short spot-check use case.

**Function:** `AuthProvider` / `useAuth()` — `frontend/src/auth/AuthContext.tsx`
**Date:** 2026-09-03
**How added:** new feature
**Purpose:** app-wide auth state — `user` (including `isAdmin`), `login()`, `logout()`. On mount, if a token exists in `localStorage`, calls `GET /auth/me` to hydrate `user` rather than trusting a stale/decoded JWT payload.
**Side effects:** reads/writes `localStorage` (via `apiClient`'s `getToken`/`setToken`); a `401` from any request clears the stored token (`apiClient.ts`'s `request()`).
**Before:** nothing — new module.
**After:** `RequireAuth`/`RequireAdmin` (`auth/RequireAuth.tsx`, `auth/RequireAdmin.tsx`) both key off this context to gate routes.

**Function:** `uploadWithProgress()` — `frontend/src/pages/UploadPage.tsx`
**Date:** 2026-09-03
**How added:** new feature
**Purpose:** uploads one file to `POST /tracks/upload` with a per-file progress callback.
**Side effects:** one `XMLHttpRequest` (not `fetch` — `fetch` has no upload-progress event, which a per-file progress bar needs).
**Before:** nothing — new function.
**After:** `UploadPage`'s queue runs up to 3 of these concurrently; each result invalidates the TanStack Query `['tracks']` cache so `LibraryPage` picks up the new track without a manual refresh.

**Function:** `requireAdmin` decorator — `backend/src/plugins/auth.ts`
**Date:** 2026-09-03
**How added:** new feature
**Purpose:** Fastify preHandler, composed after `authenticate` (`[fastify.authenticate, fastify.requireAdmin]`), gating `PATCH`/`DELETE /tracks/:id` and `POST /tracks/upload`.
**Side effects:** one `findUserById()` read per request — deliberately re-checks `is_admin` from the DB rather than trusting the JWT payload, so revoking admin takes effect on the next request instead of waiting for the token to expire.
**Before:** nothing — new decorator, `authenticate` was the only one.
**After:** `403 { error: 'Admin access required' }` for a non-admin; falls through silently for an admin (matches `authenticate`'s pattern of only replying on failure).

**Function:** `setAdmin()` — `backend/src/db/users.ts`
**Date:** 2026-09-03
**How added:** new feature
**Purpose:** flips `users.is_admin` for a username. Backs `npm run set-admin -- <username> [false]` (`scripts/set-admin.ts`) — the only path to granting/revoking admin, deliberately no HTTP endpoint or UI (matches the "small fixed user list" auth model, `.docs/reference/tech-stack.md`).
**Side effects:** one `UPDATE`.
**Before:** nothing — new function.
**After:** n/a.

**Function:** `updateTrackFields()` — `backend/src/db/library.ts`
**Date:** 2026-09-03
**How added:** new feature
**Purpose:** backs `PATCH /tracks/:id` — partial update of title/artist/album/trackNumber/hidden/notRecommended. Only builds `SET` clauses for fields actually present in the input, so a partial payload doesn't clobber untouched columns.
**Side effects:** artist/album renames go through the same `findOrCreateArtist`/`findOrCreateAlbum` resolution `upsertTrack()` uses, so a tag edit here behaves identically to a re-scan picking up a renamed artist — no divergent second code path.
**Before:** nothing — new function.
**After:** wired to `routes/tracks.ts`, `requireAdmin`-gated.

**Function:** `deleteTrackRow()` / `setLastStreamError()` — `backend/src/db/library.ts`
**Date:** 2026-09-03
**How added:** new feature
**Purpose:** `deleteTrackRow()` backs `DELETE /tracks/:id` — removes the track row plus every dangling reference to it (`favorites`, `playlist_tracks`, `play_history`) in one `db.transaction`, in that order. Correction (2026-09-03): the original note here said this was needed because FKs "aren't enforced" — wrong. `better-sqlite3` enforces FK constraints by default per connection; none of these FKs cascade, so deleting dependents first is required or the final `DELETE FROM tracks` throws a constraint error. See `.docs/reference/database-schema.md`. `setLastStreamError()` persists a diagnostic message onto `tracks.last_stream_error`, called from the stream route on a failed stream.
**Side effects:** `deleteTrackRow()` does NOT touch the file on disk — the route handler unlinks it separately (fs concern, not DB), and only calls this after the unlink succeeds or the file was already gone.
**Before:** nothing — new functions.
**After:** `DELETE /tracks/:id` is `requireAdmin`-gated, hard delete, `204` on success.

**Function:** `buildTrackFilter()`, extended `listTracks()` / `countTracks()` — `backend/src/db/browse.ts`
**Date:** 2026-09-03
**How added:** feature extension
**Purpose:** shared `WHERE`-clause + params builder for search (`LIKE` across title/artist/album)/hidden-filter/not-recommended-filter, used by both `listTracks()` and `countTracks()` so the paginated total always matches what the filtered page actually returned — a common source of drift when list and count queries build their filters separately.
**Side effects:** read-only. Sort column is resolved through an allowlist (`SORT_COLUMNS`), never string-interpolated from the raw query param.
**Before:** `listTracks(limit, offset)` — pagination only, fixed `ORDER BY title`; `countTracks()` — unfiltered total.
**After:** both take an optional `ListTracksOptions` (`search`/`sort`/`order`/`hidden`/`notRecommended`); `GET /tracks` exposes all five as query params. `hidden` defaults to excluding hidden tracks; `notRecommended` defaults to showing them (still visible/playable, only meant to be excluded from radio/shuffle logic, which doesn't exist yet).

**Function:** `getTrackDetailById()` — `backend/src/db/browse.ts`
**Date:** 2026-09-03
**How added:** new feature
**Purpose:** backs the new `GET /tracks/:id` (this endpoint didn't exist before — the feature's Structure-phase doc had incorrectly assumed it did). Returns the full diagnostic set beyond the lean list-view summary: `trackNumber`, `fileSize`, `bitrate`, `sampleRate`, `playCount`, `dateAdded`, `lastPlayedAt`, `lastStreamError`.
**Side effects:** read-only.
**Before:** nothing — new function/endpoint.
**After:** n/a.

**Function:** `streamStarted()` / `streamEnded()` / `recordStreamError()` / `getHealthSnapshot()` — `backend/src/services/streamMonitor.ts`
**Date:** 2026-09-03
**How added:** new feature (new file)
**Purpose:** in-memory stream health tracking backing `GET /admin/health`. `streamStarted`/`streamEnded` maintain a live active-stream count (wired to the stream route via `reply.raw.on('close', streamEnded)`); `recordStreamError` appends to a capped ring buffer (last 20, returns the most recent 10); `getHealthSnapshot` derives `status: 'ok' | 'degraded'` from whether any errors are on record.
**Side effects:** none persisted — process-memory only, resets on restart. Deliberate: `.docs/features/library-management-interface/planning.md` called this "minimum viable," no ring-buffer table needed yet.
**Before:** nothing — new module. `GET /health` was a one-line `{ status: 'ok' }` stub with no instrumentation.
**After:** `GET /admin/health` (any authenticated user, not admin-gated — operational data, not identity/destructive-action territory) returns `{ status, uptimeSeconds, activeStreams, recentErrors }`.

**Function:** `starTrack()` / `unstarTrack()` — `backend/src/db/favorites.ts`
**Date:** 2026-09-03 (`cea7c8f`)
**How added:** new feature
**Purpose:** back `PUT`/`DELETE /tracks/:id/favorite` — star/unstar a track for the requesting user.
**Side effects:** `starTrack` is `INSERT OR IGNORE` into `favorites` (composite PK on `user_id, track_id`); `unstarTrack` is a plain `DELETE`. Both idempotent by design — starring an already-starred track or unstarring a non-favorited one is a silent no-op, not an error, matching a toggle-style UI rather than the stricter duplicate-rejection playlists use.
**Before:** nothing — new functions.
**After:** wired to `routes/favorites.ts`, both requiring auth. `404` only for a genuinely unknown/non-numeric track id, `401` unauthenticated.

**Function:** `countFavoritesForUser()` / `listFavoritesForUser()` — `backend/src/db/favorites.ts`
**Date:** 2026-09-03 (`cea7c8f`)
**How added:** new feature
**Purpose:** back `GET /me/favorites` — the caller's own favorites, most-recently-favorited-first, paginated.
**Side effects:** read-only. Reuses the existing lean track-summary shape (title/artist/album/duration/format) plus `favoritedAt`, same `{ total, limit, offset, ... }` envelope as `/tracks`/`/me/history`.
**Before:** nothing — new functions.
**After:** n/a. `isFavorited` inline on `GET /tracks`/etc. was deliberately not built here — deferred to a follow-up (see `.docs/features/favorites-starred-tracks/planning.md`).

**Function:** `smartShuffle()` — `backend/src/services/shuffle.ts`
**Date:** 2026-09-03 (`cea7c8f`)
**How added:** new feature
**Purpose:** reorder a list of `{ trackId, artistId }` so no two same-artist tracks land adjacent, unless one artist exceeds half the set (in which case it hits the mathematical minimum of forced adjacent pairs, `2×dominant - total - 1`, rather than leaving it to chance).
**Side effects:** none — pure function, no DB/HTTP dependency. Groups tracks by artist, greedily interleaves by always placing next from the largest remaining group that isn't the one just placed (the standard "reorganize string" algorithm). `artist_id IS NULL` tracks are grouped together as one bucket, not scattered as singletons. Input is pre-shuffled so within-group order and equal-size tie-breaks vary between calls.
**Before:** nothing — new function.
**After:** backs `POST /shuffle` (`routes/shuffle.ts`). Covered by a new unit test suite (`services/shuffle.test.ts`, Node's built-in test runner — first test infra in this repo) exercising balanced/skewed/single-artist/null-artist/empty-input cases and the exact-minimum-violation math.

**Function:** `getTrackSummariesByIds()` — `backend/src/db/browse.ts`
**Date:** 2026-09-03 (`cea7c8f`)
**How added:** new feature
**Purpose:** batch-fetch lean track summaries for the `POST /shuffle` response.
**Side effects:** read-only, single `IN (...)` query — not N+1.
**Before:** nothing — new function.
**After:** paired with `findTracksByIds()` (`db/library.ts`, also new) which validates every requested `trackId` exists before shuffling; `404` with `{ missing: [...] }` on any unknown id.

**Function:** `extractTrackTags()` — `backend/src/services/trackTags.ts`
**Date:** 2026-09-03 (`6f7ae2e`)
**How added:** refactor (extracted from `services/scanner.ts`), needed so the new upload route and the scanner apply identical tag-fallback rules.
**Purpose:** read title/artist/album/year/track number/duration/codec via `music-metadata`, falling back to filename (title) and `"Unknown Artist"` on missing tags.
**Side effects:** none new — same `music-metadata` read as before, now in a shared location. The upload path passes the *original* client filename for the fallback, not the random staging name.
**Before:** tag reading was inlined directly in `scanner.ts`'s per-file scan loop, only reachable from the scan flow.
**After:** shared by `scanLibrary()` (scan) and the new `POST /tracks/upload` route, so scan and upload can never silently diverge on fallback behavior.

**Function:** `sanitizePathSegment()` / `fileIntoLibrary()` — `backend/src/services/trackFiling.ts`
**Date:** 2026-09-03 (`6f7ae2e`)
**How added:** new feature
**Purpose:** compute the on-disk destination for an uploaded track (`LIBRARY_PATH/<Artist>/<Album>/<filename>`) and write it there safely.
**Side effects:** `sanitizePathSegment()` is pure (strips invalid filesystem characters, trims trailing dots, falls back to "Unknown Artist"/"Unknown Album" on an empty result — this is what defangs a path-traversal attempt in an artist/album/filename). `fileIntoLibrary()` touches the filesystem: never overwrites an existing file (same-name collisions get a `(2)`, `(3)`, ... suffix), moves the staged file via `fs.rename` with an `EXDEV` (cross-filesystem) fallback to copy+delete.
**Before:** nothing — new functions. Uploaded files had no filing logic at all.
**After:** called from the `POST /tracks/upload` route handler after `extractTrackTags()` succeeds; verified manually with a path-traversal-style filename (`../../../../etc/passwd_style../../file.mp3`) which sanitized down to `file.mp3` and stayed inside the intended `Artist/Album/` folder.

**Function:** `POST /tracks/upload` route handler — `backend/src/routes/tracks.ts`
**Date:** 2026-09-03 (`6f7ae2e`)
**How added:** new feature
**Purpose:** accept a `multipart/form-data` single-file upload, validate it, tag it, and file it into the library.
**Side effects:** streams the incoming file to `UPLOAD_STAGING_PATH` under a server-generated `crypto.randomUUID()` name (client-supplied filename never trusted beyond its extension) via `@fastify/multipart` (new dep, registered in `app.ts` with `limits.fileSize` from `MAX_UPLOAD_SIZE_MB` and `limits.files: 1`). Deletes the staged file and returns `400` on an unsupported extension or a corrupt/unparseable file; deletes the partial file and returns `413` on an oversized upload (`file.truncated` flag). On success, calls `extractTrackTags()` → `fileIntoLibrary()` → the existing `upsertTrack()` (`db/library.ts`, unchanged) so a later rescan updates the same row instead of duplicating it.
**Before:** nothing — new route. Tracks could only enter the library via a filesystem scan.
**After:** responds `201 { track }` using the same lean shape as `GET /tracks` (via the new `getTrackSummaryById()` in `db/browse.ts`).

**Function:** `scanLibrary()` — `backend/src/services/scanner.ts`
**Date:** 2026-09-03 (`05100c8`)
**How added:** new feature
**Purpose:** walk `LIBRARY_PATH` (via `fs.readdir(..., { recursive: true })`), read tags for every supported audio file, and upsert them into the library.
**Side effects:** per-file `fs.stat` + `music-metadata` read; per-file parse failures are caught, logged, and skipped rather than aborting the whole scan (also surfaced in the response's `failures` array).
**Before:** nothing — new function.
**After:** backs `POST /library/scan` (`routes/library.ts`, requires auth); tag-reading logic was later extracted out into the shared `extractTrackTags()` (see `6f7ae2e` above).

**Function:** `upsertTrack()` — `backend/src/db/library.ts`
**Date:** 2026-09-03 (`05100c8`)
**How added:** new feature
**Purpose:** idempotent insert/update of a track (and its artist/album, found-or-created by name/title) keyed by file path.
**Side effects:** writes to `tracks`/`artists`/`albums`. Only ever writes the columns it explicitly lists — verified later (scrobble, favorites, upload features) to confirm a rescan never clobbers denormalized play-count/favorite data it doesn't own.
**Before:** nothing — new function.
**After:** reused unchanged by both `POST /library/scan` and, later, `POST /tracks/upload` (`6f7ae2e`) — re-running a scan after an upload updates the same row rather than duplicating it.

**Function:** `mimeTypeFor()` / `parseRange()` / `transcodeToLowQuality()` — `backend/src/services/streaming.ts`
**Date:** 2026-09-03 (`05100c8`)
**How added:** new feature
**Purpose:** back `GET /tracks/:id/stream`. `mimeTypeFor()` maps file extension → `Content-Type`. `parseRange()` parses a single `Range: bytes=...` header (start-end, open-ended, and suffix forms). `transcodeToLowQuality()` pipes the file through `fluent-ffmpeg` (`?quality=low`) to `libopus`/ogg at a 64k target bitrate.
**Side effects:** `transcodeToLowQuality()` spawns a system `ffmpeg` process; requires `.noVideo()` on the command — without it, ffmpeg transcodes an embedded cover-art image stream into a spurious Theora video track, bloating the output. Output length is unknown ahead of time, so `Accept-Ranges: none` on this path.
**Before:** nothing — new functions.
**After:** malformed/out-of-bounds ranges from `parseRange()` get `416` with `Content-Range: bytes */<size>`; no `Range` header falls through to a full `200`.

**Function:** `listArtists()` / `countArtists()` / `getArtistDetail()`, `listAlbums()` / `countAlbums()` / `getAlbumDetail()`, `listTracks()` / `countTracks()` / `getTrackSummaryById()` — `backend/src/db/browse.ts`
**Date:** 2026-09-03 (`05100c8`)
**How added:** new feature
**Purpose:** back `GET /artists`, `/artists/:id`, `/albums`, `/albums/:id`, `/tracks` — paginated lists plus detail views with nested children (artist→albums, album→tracks ordered by `track_number`, nulls last).
**Side effects:** read-only. Aggregates (`trackCount`/`albumCount`) computed via `LEFT JOIN` + `COUNT(DISTINCT ...)` rather than N+1 queries; responses never include internal columns (`path`, `date_added`, etc.).
**Before:** nothing — new functions.
**After:** paired with `utils/pagination.ts` (new — default limit 50, max 200, invalid/negative values fall back to defaults).

**Function:** `searchLibrary()` — `backend/src/db/browse.ts`
**Date:** 2026-09-03 (`05100c8`)
**How added:** new feature
**Purpose:** back `GET /search?q=` — `LIKE '%q%'` across artist/album/track names, results grouped by type and each capped at 20.
**Side effects:** read-only. Case-insensitive for ASCII only (not accent/kana-folding); FTS5 is the planned upgrade once the library outgrows this, per `.docs/reference/tech-stack.md` — not needed yet.
**Before:** nothing — new function.
**After:** `400` on empty/missing `q`.

**Function:** `createPlaylist()` / `renamePlaylist()` / `deletePlaylist()` / `listPlaylistsForUser()` / `getPlaylistDetail()` / `findPlaylistById()` — `backend/src/db/playlists.ts`
**Date:** 2026-09-03 (`05100c8`)
**How added:** new feature
**Purpose:** back the full playlist CRUD surface (`POST`/`GET`/`PATCH`/`DELETE /playlists`, `GET /playlists/:id`).
**Side effects:** `deletePlaylist()` removes the playlist and its `playlist_tracks` rows explicitly in one transaction — no FK-cascade relied on, since `better-sqlite3`'s `foreign_keys` pragma isn't enabled in this project.
**Before:** nothing — new functions.
**After:** every route using these is gated by a shared `loadOwnedPlaylist` helper (`routes/playlists.ts`) — `404` if the playlist doesn't exist, `403` if it belongs to a different user — used on every route that takes a playlist id so the ownership check can't be accidentally skipped on one route.

**Function:** `addTrackToPlaylist()` / `removeTrackFromPlaylist()` / `isTrackInPlaylist()` / `getPlaylistTrackIdsInOrder()` / `reorderPlaylistTracks()` — `backend/src/db/playlists.ts`
**Date:** 2026-09-03 (`05100c8`)
**How added:** new feature
**Purpose:** back `POST`/`DELETE /playlists/:id/tracks` and `PATCH /playlists/:id/tracks/reorder`.
**Side effects:** `addTrackToPlaylist()` appends at `MAX(position)+1` (or `0` for an empty playlist); composite PK on `(playlist_id, track_id)` means a track can't be added twice. The reorder route (not this file) verifies the submitted `trackIds` list is exactly the playlist's current track set — same ids, no dupes/missing/extra — before calling `reorderPlaylistTracks()`, rejecting with `400` otherwise; chosen over a single `{ trackId, newPosition }` move because it was simpler to make provably correct, and playlists are small enough that shipping the whole order each time is cheap.
**Before:** nothing — new functions.
**After:** `409` from the route on adding an already-present track, `404` on adding/removing a track not in the library/playlist.

**Function:** `recordScrobble` — `backend/src/db/plays.ts`
**Date:** 2026-09-03 (`05100c8`)
**How added:** new feature
**Purpose:** back `POST /tracks/:id/scrobble` — record a play and update the track's denormalized play stats.
**Side effects:** a `db.transaction`-wrapped function: inserts a `play_history` row and increments `tracks.play_count` / sets `tracks.last_played_at` atomically, so the detail table and the denormalized columns never drift apart.
**Before:** nothing — new function.
**After:** no minimum-listen threshold and no dedup/anti-spam — every call counts as a play, including immediate repeats from the same user, per the original plan.

**Function:** `listHistoryForUser()` / `countHistoryForUser()`, `listHistoryForTrack()` / `countHistoryForTrack()`, `listTopTracks()` / `countTopTracks()` — `backend/src/db/plays.ts`
**Date:** 2026-09-03 (`05100c8`)
**How added:** new feature
**Purpose:** back `GET /me/history` (caller's own plays only), `GET /tracks/:id/history` (play history for one track, shared across all users with attribution — deliberately not per-caller, unlike playlists), and `GET /stats/top-tracks` (sorted by the denormalized `play_count`, no join needed).
**Side effects:** read-only.
**Before:** nothing — new functions.
**After:** n/a.

**Function:** `registerAuthDecorator()` — `backend/src/plugins/auth.ts`
**Date:** 2026-09-03 (`1b61cb6`)
**How added:** new feature
**Purpose:** register the `fastify.authenticate` decorator used to gate every protected route (`GET /auth/me` onward, and every route added in every later commit) on a valid `Authorization: Bearer <jwt>` header.
**Side effects:** none itself — wraps `verifyToken()` (`services/token.ts`) and short-circuits the request with `401` on a missing/malformed header or an invalid/expired token.
**Before:** nothing — new function.
**After:** every route file added in this repo's history (`library`, `tracks`, `artists`, `albums`, `playlists`, `history`, `stats`, `favorites`, `shuffle`) depends on this decorator existing first.

**Function:** `hashPassword()` / `verifyPassword()` — `backend/src/services/password.ts`
**Date:** 2026-09-03 (`1b61cb6`)
**How added:** new feature
**Purpose:** bcrypt hashing (12 salt rounds) and verification for `POST /auth/register`/`/auth/login`.
**Side effects:** `hashPassword()` is async, CPU-bound (bcrypt).
**Before:** nothing — new functions.
**After:** n/a. Note: bcrypt's build-time dependency `@mapbox/node-pre-gyp` pulls a vulnerable `tar` version (`npm audit`: 1 high, 1 critical) — install-time only, not part of the runtime request path.

**Function:** `signToken()` — `backend/src/services/token.ts`
**Date:** 2026-09-03 (`1b61cb6`)
**How added:** new feature
**Purpose:** sign a JWT (`sub`+`username` payload) on successful login.
**Side effects:** reads `JWT_SECRET` from `.env` (falls back to `'change-me'` if unset), expiry from `JWT_EXPIRES_IN` (default `7d`).
**Before:** nothing — new function.
**After:** verified counterpart lives in the same file, used by `registerAuthDecorator()`.

**Function:** `findUserByUsername()` / `findUserById()` / `insertUser()` — `backend/src/db/users.ts`
**Date:** 2026-09-03 (`1b61cb6`)
**How added:** new feature
**Purpose:** back `POST /auth/register` (duplicate-username check + insert), `POST /auth/login` (lookup + verify), `GET /auth/me` (lookup by id from the decoded token).
**Side effects:** `insertUser()` writes to `users`; `409` from the route on a duplicate username.
**Before:** nothing — new functions.
**After:** n/a.

**Function:** `buildApp()` — `backend/src/app.ts`
**Date:** 2026-09-03 (`1b61cb6`)
**How added:** new feature
**Purpose:** construct and configure the Fastify instance — plugin registration point for every cross-cutting concern added over the project's history (auth decorator, later `@fastify/multipart` for uploads, `@fastify/cors`).
**Side effects:** none itself.
**Before:** nothing — new function.
**After:** `@fastify/cors` was registered here later (`{ origin: true }`) after discovering the backend had no CORS handling at all, which silently blocked every `fetch()` from a browser-opened HTML test page (confirmed via headless Chromium; curl-only verification had missed it since curl doesn't enforce CORS).

**Function:** `normalizeTrack()` / `bootstrapFromHandoff()` — `library-player.html` (repo root, manual test harness, no build step)
**Date:** 2026-09-03 (`05100c8`, revised in later same-day commits)
**How added:** new feature, then corrected
**Purpose:** `normalizeTrack()` maps a raw `GET /tracks` item into the shape the player UI renders. `bootstrapFromHandoff()` (an IIFE) reads `?base=`/`?token=` from the URL on load to skip the manual login step when arriving from `login.html`.
**Side effects:** none beyond local page state; `bootstrapFromHandoff()` calls `loadLibrary()` immediately when handoff params are present.
**Before:** `normalizeTrack()` originally guessed at field names (cover art path, bitrate/sample-rate) that don't exist on this backend.
**After:** narrowed to the confirmed live shape (`{ id, title, artist, album, duration, format }`); `coverPath` cleared to empty (no cover-art endpoint exists anywhere in the API — confirmed by source grep and live 404s) and bitrate/sample-rate hardcoded to `null` (no such columns exist in the `tracks` schema at all) rather than guessing.
