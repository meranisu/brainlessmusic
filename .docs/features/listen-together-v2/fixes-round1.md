# Listen together fixes, round 1 (owner report 2026-10-21)

## Context
After the v2 rooms shipped (v0.4.27 to v0.4.29), the owner reported six problems: the room name sits badly on Now Playing,
vote to skip "skips instantly", the lobby Start button is small and off to the side, room settings are buried at the
bottom of the lobby, the lobby's now playing card is cluttered and cuts long titles, and invites only show once the app is
opened, with no way to reject them.

What the investigation found:
- **The vote skip is working as built.** The host skips at once (A257). So does whoever added the song (A254), and every
  song in the starting queue counts as the host's (`backend/src/services/rooms.ts:626`, `toEntries` `:430-445`). With 2
  people, one vote skips (`votesNeeded`, `:88-91`). So when the owner tested as host, every Next was instant. On top of
  that, Android never tells a guest that Next is a vote: `nextLabel()` and `nextIsVote()` in `rooms/RoomModels.kt:86-96`
  are never called.
- **Invites are polled every 15 s** (`rooms/RoomInvites.kt:128`), but only while `MainActivity` is started or
  `PlaybackService` is running. There is no push service. Invites are held in memory with a 10 min TTL (`rooms.ts:20`). Decline
  already exists on the backend (`DELETE /rooms/invites/:code`, `routes/rooms.ts:187`) and on web (`InviteBanner.tsx`).
  Android declares it (`ApiService.kt:352`) but never calls it.

Owner answers (chat, 2026-10-21). Record them as A262 to A265 in `.docs/QUESTIONS.md` as the first step:
- **A262:** the room name becomes a chip centred above the cover. It leaves the top bar.
- **A263:** the host votes like everyone else. The adder still skips their own song at once. Two people: one vote still
  skips. This replaces A257.
- **A264:** no push service for now. The notification gets Join and Reject buttons, Android gets an in-app invite
  banner, and the invite TTL goes from 10 min to 30 min.
- **A265:** the lobby changes apply to web and Android both.

antislop mode: during (global preference). Read `DESIGN.md` plus the antislop core and UI skills before the UI edits.

## 1. Room chip above the cover (A262)
- **Android** `ui/playback/NowPlayingScreen.kt`:
  - Remove the room `Row` part of the `TopAppBar` title (`:161-180`) and keep only `Text("Now playing")`.
  - Add a `RoomChip` as the first child of the body `Column` (`:262`), before `when (skin)`, so every skin gets it.
  - The chip is a small rounded `Surface`/`AssistChip` reading `Room ABCD`, or `Reconnecting…` while offline, in
    `MaterialTheme.accentInk`.
  - Tapping it calls `onOpenTogether`, the same as the headphones action. Render it only when `room.room != null`.
- **Web mobile** `components/NowPlaying.tsx:226-247`:
  - The header centre goes back to a plain label ("Now playing" or "Playing from library").
  - The room `<Link to="/together">` becomes a pill above the artwork, using the same text and colours.
- **Web desktop** `components/DesktopNowPlaying.tsx:95-100`: add the same pill above the cover. It shows nothing today.

## 2. Vote to skip (A263)
- **Backend** `services/rooms.ts`, in `case 'next'` (`:485-500`):
  - Drop `isHost` from the instant-skip condition.
  - The host keeps instant skip only when `skip` is `'host'`. That setting already means "only the host may skip", so
    the host's press must still work there.
  - Starting-queue entries count as the room's songs, not the host's. Add `seed?: true` on `QueueEntry`, set it in `create()`
    (`:626`), and make the adder rule `!current.seed && current.addedBy === userId`. Without this, the host's whole
    starting queue would still skip at once.
  - `addedBy` is unchanged, so the avatars, `editQueue` checks (`:545`, `:568`) and take-turns grouping (`:299`) behave
    the same.
- **Tests** `services/rooms.test.ts`:
  - Update the host-skip case at `:513`.
  - Add three cases: the host votes in a 3-person room, a seeded song needs votes from the host, and host-only mode still
    lets the host skip.
- **Android:**
  - Use `RoomState.nextLabel()` for the Next button's content description and label in `NowPlayingScreen.kt:520,558`,
    the skin decks and `MiniPlayer.kt:111`.
  - On a vote that settles at once, show the "Skipped by vote" toast so the skip is explained. Check how `voteMessage`
    (`RoomModels.kt:153-160`) is fed, and compare the previous entry with the new one.
- **Web:**
  - The labels already come from `roomNextLabel` (`lib/roomClient.ts:70-87`). That function and `nextIsVote` need the
    same host change.
  - Mirror the settled-vote toast in `RoomProvider.tsx:65-70`.

## 3. Lobby: full-width Start at the bottom (A265)
- **Android** `ui/together/TogetherScreen.kt` `OutsideRoom` (`:241-309`):
  - Remove the trailing `OutlinedButton`.
  - While outside a room, the `Scaffold` gets a `bottomBar` with a full-width filled `Button` ("Start a room" or
    "Starting…"). It sits above the system bar, using `navigationBarsPadding()`.
  - The cover and description row stays in the column as context. `startError` shows above the button.
- **Web** `pages/TogetherPage.tsx` `OutsideRoom` (`:107-118`): the Start button becomes `w-full` at the bottom of the card
  (`mt-auto`), the same size as the Join card's primary button.
  - On mobile widths, make it sticky to the bottom (`sticky bottom-0`) only if the card is below the fold. Otherwise
    leave it in the card.

## 4. Settings button opens a settings sheet
- **Android:**
  - `TogetherScreen` `TopAppBar` actions (`:99-136`): while in a room, add an `IconButton(AppIcons.settings)` before
    People. It opens a `SkinSheet` (`ui/common/SkinParts.kt:564-572`) containing the `RoomSettingsPanel` body.
  - Remove the inline `RoomSettingsPanel` from `InsideRoom` (`:439-441`).
  - Non-hosts get the same button with the read-only view, so they can see the rules.
  - Split `RoomSettingsPanel` so the rows render without its outer `Panel` inside the sheet, with a sheet title "Room
    settings".
- **Web:**
  - A `GearIcon` (`components/icons.tsx:146`) button in the room code card's button group (`:373-413`) opens a dialog.
  - Use the `ConfirmDeleteDialog` scrim and card pattern: `motion-scrim`, `motion-pop`, `role="dialog"`, Esc and scrim
    close, focus on open. Put the `RoomSettingsCard` rows inside.
  - Remove the inline card from the right column (`:554-560`).

## 5. Lobby now playing card
- **Android** `NowPlayingCard` (`TogetherScreen.kt:463-531`):
  - Remove `AddedByAvatar` (`:511-513`).
  - Title: replace `overflow = Ellipsis` with `Modifier.basicMarquee()`. Compose BOM is 2024.09.00, so foundation 1.7
    has it. Keep `maxLines = 1`.
  - The queue icon stays.
- **Web** (`TogetherPage.tsx:419-447`):
  - Remove `<AddedBy>`.
  - Add a small `MarqueeText` component. It measures `scrollWidth > clientWidth` with a `ResizeObserver` and, only when the text
    overflows, scrolls it with a CSS keyframe, the same two-copy technique as `wordmark-crawl` (`index.css:528`).
  - Under `prefers-reduced-motion` it stays truncated.

## 6. Invites: Join / Reject, banner, longer TTL (A264)
- **Backend:** `INVITE_TTL_MS` changes to 30 min (`services/rooms.ts:20`). Check the tests that rely on 10 min.
- **Android notification** (`RoomInvites.notify`, `:98-124`):
  - **Join:** add an `addAction` button using the existing `/join/<code>` `PendingIntent`.
  - **Reject:** add an `addAction` button whose `PendingIntent.getBroadcast` targets a new `InviteActionReceiver`, which
    needs an `@AndroidEntryPoint` and a manifest `<receiver exported="false">`.
  - The receiver calls `goAsync()`, then `api.declineInvite(code)` on a coroutine. It cancels the notification and
    adds the code to `announced` so the poll does not post it again.
  - Keep the notification ID per code, so it can be cancelled.
- **Android in-app banner:**
  - `RoomInvites` exposes `StateFlow<List<RoomInviteDto>>` from `poll()`.
  - A banner composable sits under the top bar in the main scaffold and matches web `InviteBanner`: Join (or Switch rooms
    when already in a room) and Not now. Not now calls decline.
  - If R8 is involved, add a keep rule for any new Gson-parsed class outside `dto/` (see the R8 memory note). The
    receiver passes the code as a string extra, so the receiver itself needs none.
- Closing the app still stops invites until it is opened again. Say so plainly in the CHANGELOG.

## Docs
- `.docs/QUESTIONS.md`: add A262 to A265. Mark A257 as replaced by A263.
- Add CHANGELOG and FUNCTIONLOG entries.
- Save this plan to `.docs/features/listen-together-v2/fixes-round1.md`.
- Add Android release notes for the next version, and update STATUS if the state moves.

## Verification
1. `cd backend && npm test`. Run it only when no other session is running tests (shared `test.db`).
2. `cd frontend && npm run build && npm run lint`.
3. Run `free -h` first, then `cd android && ./gradlew assembleDebug`, in the background.
4. **Web:** Playwright against an isolated backend with two or three signed-in accounts. Check that:
   - the host's Next starts a vote in a 3-person room
   - the settings dialog opens and closes
   - Start is full width
   - a long title scrolls, and the avatar is gone
   - the room pill is above the art
   - Not now on an invite removes it
5. **Android:** use the emulator (`scripts/emulator.sh`) if RAM allows. Check the chip on the Standard skin and one game
   skin, the bottom Start button, the settings sheet, the marquee, and an invite notification's Join and Reject buttons.
   Otherwise, report it as not device-tested.

## Unresolved questions
1. Should seeded starting-queue songs need votes even from the host? This plan says yes; without it, A263 changes nothing
   for the host's own queue.
2. In host-only skip mode, the host's Next stays instant. Is that OK?
3. Should the Android invite banner show on every screen, or only Home and the Library?
