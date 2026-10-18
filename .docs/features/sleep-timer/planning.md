# Sleep timer (Android)

## Goal

Stop the music by itself at bedtime, so the owner can fall asleep to a playlist without it playing all night.

**Done when:** on the phone, starting a 15 minute timer with the screen off makes the music fade out and pause, and
Play the next morning resumes the same queue at full volume.

## Not doing

- Web (the web app is the control room, A204).
- A countdown in the notification, a "+5 min" button, a custom minutes field, an alarm or wake-up playlist.
- Pausing a Listen together room for everyone.
- Ideas go to [feature-brainstorm.md](../feature-brainstorm.md).

## Decisions

- A204: Android only; choices are 15, 30, 45, 60, 90 minutes and "End of current song".
- A205: at zero the volume fades over 10 seconds, then playback pauses. The queue stays.
- A206: in a room, at zero this phone leaves the room and pauses. The room keeps playing for everyone else.
- Defaults taken without asking: the timer keeps counting if the music is paused by hand; stopping playback (swipe away,
  sign out) cancels the timer.

## Phase Overview

| Phase | What it covers | Status | Checklist |
|---|---|---|---|
| 1. Plan (blueprint) | Choices, behaviour at zero, rooms | Done | [Phase 1](#phase-1-plan) |
| 2. Structure (foundation) | `SleepTimerLogic`, controller hooks, unit tests | Done, 11 tests pass | [Phase 2](#phase-2-structure) |
| 3. Interior (Android) | Sheet, Now Playing button, icons in five skins | Built, Kotlin compiles, not on a phone | [Phase 3](#phase-3-interior-android) |
| 4. Walkthrough (handover) | Phone checks, docs, release | Not started | [Phase 4](#phase-4-walkthrough) |

## Phase 1: Plan

- [x] Platforms, choices, behaviour at zero and in a room agreed (A204 to A206)

## Phase 2: Structure

- [x] `playback/SleepTimer.kt`: `SleepTimerLogic` (clock, scheduler and actions injected), `SleepTimer` (Hilt singleton)
- [x] `PlaybackController.fadeOutAndPause(fadeMs)`, `pauseAtEndOfSong(on)`, `onSleepSongEnd`
- [x] `checkBoundary()` skips while a sleep fade runs or an end-of-song pause is armed
- [x] `SleepTimerTest` (11 cases)
- [x] Tests run 2026-10-18: `./gradlew testDebugUnitTest --tests '*SleepTimerTest'`, 11 pass

## Phase 3: Interior (Android)

- [x] `ui/playback/SleepTimerSheet.kt` on `SkinSheet`
- [x] Moon button in the Now Playing top bar, lit while a timer runs
- [x] `AppIcons.sleep` in all five sets (Material `Bedtime`, Font Awesome, Lucide, Phosphor moons; Ring's moon is drawn in
      the set's grid because the MingCute path was not to hand)
- [x] `compileDebugKotlin` passes (ran as part of the test task); full `assembleDebug` not run

## Phase 4: Walkthrough

- [ ] 15 minute timer, screen off: fades over about 10 s, pauses; Play next morning resumes at full volume
- [ ] End of current song with crossfade on: no crossfade, pauses where the song ends; Play carries on into the next song
- [ ] Tap play during the fade: the music comes back and the timer is off
- [ ] In a room with a friend: at zero this phone leaves and pauses, the friend keeps playing
- [ ] Top bar with five icons (Standard skin, like and add shown) on a narrow phone: title still readable
- [ ] Each skin: sheet opens, moon shows
- [ ] Release notes `android/release-notes/v0.4.21.md`, tag and release

## Change log

- 2026-10-18: planned and built. Open point for the phone: `pauseAtEndOfMediaItems` is the same switch rooms use; on
  exit from a room it is reset to false, which is why an end-of-song timer turns into a countdown when a room is joined.
  A crossfade already running when "End of current song" is chosen still completes, and the pause lands at the end of
  the next song.
