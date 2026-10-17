# Headset buttons: working presses + a choice of what each press does

## Context

Owner reports headset buttons (wired and Bluetooth) do nothing in the Android app, and asks for an option to choose
what each press does, on web and Android. Both apps already have a media session:

- Android: `PlaybackService.kt:59` builds a Media3 1.4.1 `MediaSession` on `controller.sessionPlayer`
  (`PlaybackController.kt:96`, a `ForwardingPlayer` that adds fades and room handling). No custom media-button handling.
- Web: `PlayerBar.tsx:1662-1702` binds `navigator.mediaSession` play/pause/next/previous/seek handlers. Browsers never
  expose raw presses, only these actions.

Owner answers (to log as Q200/Q201 + A202/A203 in `.docs/QUESTIONS.md`, Answered, at the start of implementation;
plan mode blocked writing them first):
- Android today: a single press does nothing. So there is a bug to find, not only options to add.
- Actions offered: play/pause, next, previous, seek +10 s, seek -10 s (plus "Do nothing"). No favorite, no shuffle.

## Settings model (both platforms, per device, same as data saver)

Five slots, each picks one action from `PLAY_PAUSE, NEXT, PREVIOUS, SEEK_FORWARD, SEEK_BACK, NONE`:

| Slot | Default | Why it exists |
|---|---|---|
| 1 press (play/pause or wired hook button) | Play/pause | |
| 2 presses | Next | |
| 3 presses | Previous | |
| "Next" button | Next | Most Bluetooth earbuds decode taps themselves and send NEXT/PREVIOUS, not raw presses |
| "Previous" button | Previous | same |

Press window 400 ms. If 2x and 3x are both "Do nothing", a single press acts at once (no delay). A press arriving
as the 3rd fires at once. Seek step 10 s, clamped to 0..duration. Long press is left to the OS (assistant).
In a Listening Together room every action still goes through the room path, as today.

## Step 0: find why Android ignores presses (before building)

1. Add a `Log.i` in a `MediaSession.Callback.onMediaButtonEvent` override (exists in 1.4.1, verified with `javap`).
2. Phone over adb (Windows `adb.exe`): `adb shell cmd media_session dispatch play-pause`, `dispatch headsethook`,
   `adb shell dumpsys media_session` (is our session the active / media-button session?).
3. Fix the root cause found (suspects: session not the platform's media-button session, MIUI routing, audio focus
   handling). If the cause is outside the app (phone setting), report it, do not paper over it.

## Android

- `playback/HeadsetPresses.kt` (new, pure Kotlin): counts presses with an injected clock/scheduler, returns the
  slot to fire. Unit-tested in `src/test/.../playback/HeadsetPressesTest.kt` (single, double, triple, slow presses,
  immediate fire when 2x/3x unmapped).
- `playback/HeadsetAction.kt` (new): the enum + `HeadsetButtonPrefs` data class.
- `data/local/PlaybackSettings.kt`: one `Flow<HeadsetButtonPrefs>` + setters, stored as enum names (pattern of
  `shuffleMode` at line 45).
- `PlaybackService.kt`: override `onMediaButtonEvent`. Read `Intent.EXTRA_KEY_EVENT`; for `KEYCODE_HEADSETHOOK` /
  `MEDIA_PLAY_PAUSE` feed `HeadsetPresses`; for `MEDIA_NEXT` / `MEDIA_PREVIOUS` fire their slot; consume ACTION_UP and
  repeats; return `false` for every other key so Media3's default still handles explicit PLAY/PAUSE/STOP.
  Prefs mirrored from the Flow like `keepPlayingWhenSwipedAway` (line 85).
- Run actions on `controller.sessionPlayer` (play/pause, `seekToNext`, `seekToPrevious`, `seekTo`) so fades and
  rooms keep working.
- `ui/settings/SettingsScreen.kt` + `SettingsViewModel.kt`: new "Headset buttons" section, five rows, each opens an
  `AlertDialog` with radio options (reuse the existing `AlertDialog` / `RadioButton` pattern at line 273 / 671).
- `android/release-notes/vX.Y.Z.md` and version bump, per release routine.

## Web

- `frontend/src/lib/headsetButtons.ts` (new): prefs load/save in `localStorage` (pattern of `streamQuality.ts`),
  plus a small press counter (`setTimeout` based, same rules as Android).
- `PlayerBar.tsx:1677-1680`: `play` and `pause` handlers both count as one press; `nexttrack` / `previoustrack` fire
  their slots. Seek uses existing `seek()`, step 10 s for headset actions (lock-screen seek buttons keep
  `SEEK_STEP_SECONDS = 5`). Keyboard media keys share this path, which is expected.
- `pages/OptionsPage.tsx`: "Headset buttons" section, five `<select>`s, matching the existing Options sections.
  Note in the section: on web the browser decides what reaches the page, so 2x/3x may not work on every browser.
- UI work: resolve antislop mode (global preference) and read `DESIGN.md` before the section is built.

## Docs

`.docs/CHANGELOG.md`, `.docs/FUNCTIONLOG.md`, QUESTIONS entries, this plan saved to
`.docs/features/headset-buttons/planning.md`, `.docs/STATUS.md` row. No backend change, no migration.

## Verification

1. `cd android && ./gradlew testDebugUnitTest assembleDebug` (check `free -h` first).
2. Install on the Poco F5; adb `cmd media_session dispatch` single/double/triple and next/previous, with each
   setting changed at least once; logcat shows the mapped action.
3. Owner: real wired headset and Bluetooth earbuds, app in background and screen off.
4. `cd frontend && npm run build && npm run lint`; run dev on `:5180`, press keyboard play/pause/next keys and a
   Bluetooth headset on desktop Chrome; change settings, reload, settings persist.

## Unresolved questions

- 400 ms window okay, or want it adjustable?
- Defaults 2x = next, 3x = previous okay?
