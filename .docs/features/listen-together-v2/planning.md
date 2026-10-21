# Listen together v2: host settings, vote to skip, invites, adder pictures

## Goal

Make rooms fair with several people: the host sets how the room runs, Next is a vote for anyone who didn't add the
song, friends can be invited from inside the app or joined from their now playing card, and each queue row shows
whose song it is.

**Done when:** three people in a room on web and Android: the host invites the other two from the app, they join from
the banner or notification, the host turns on Take turns and everyone sees it, a non-adder's Next counts as a vote and
the second vote skips, and every queue row shows the adder's picture.

## Not doing

- Push notifications (FCM): an Android invite only arrives while the app or its playback service is running.
- Saving rooms, settings or invites across a server restart (rooms are in memory by design).
- Chat, reactions, room recap, auto-fill (ideas from the 2026-10-21 brainstorm in chat; not picked).

## Decisions

- A252 (Start stays in the lobby), A253 (host gets finer settings; only the host changes them), A254 (vote to skip:
  adder at once, more than half, one vote with two), A255 (invites: in-app list and Join on now playing), A256 (adder
  pictures in the queue). Then A257 (host skips at once), A258 (only the host invites until they allow
  others), A259 (Shuffle off keeps the order).

## Phase Overview

| Phase | What it covers | Status | Checklist |
|---|---|---|---|
| 1. Plan | Owner picks, protocol shape | Done | [Phase 1](#phase-1-plan) |
| 2. Structure | Room engine settings and votes, invites, now playing room code | Done | [Phase 2](#phase-2-structure) |
| 3. Interior (web) | Settings card, invite picker and banner, queue pictures, vote labels | Done | [Phase 3 web](#phase-3-interior-web) |
| 3. Interior (Android) | Same on Android, invite notification | Built, not seen on a device | [Phase 3 Android](#phase-3-interior-android) |
| 4. Walkthrough | Docs, release, device checks | In progress | [Phase 4](#phase-4-walkthrough) |

---

## Phase 1: Plan

- [x] Owner answers recorded (A252-A256), then A257-A259
- [x] `RoomSettings` shape and defaults: everything as before, except skipping is a vote
- [x] Invites in memory in the room registry; no migration

## Phase 2: Structure

- [x] `settings` op (host-only, validated), `allowed()` gate, `not-allowed` / `turns-on` / `bad-settings` reasons
- [x] Vote to skip with `votesNeeded()`, settled on vote, disconnect and leave
- [x] Shuffle, take turns, repeat one/all
- [x] `addedByName` / `addedByAvatarId` on queue entries
- [x] `GET /rooms/invitable`, `POST/GET /rooms/invites`, `DELETE /rooms/invites/:code` (accounts only)
- [x] `roomCode` in `/social/now-playing`, plus room members who don't check in
- [x] Tests: `services/rooms.test.ts`, `routes/rooms.test.ts`, `guestAccess.test.ts`

## Phase 3: Interior (web)

- [x] Room settings card (host pickers, read-only for others), help text follows the settings
- [x] Invite people picker; invite banner (15 s poll) with Join / Not now
- [x] Adder picture on Listen together, Now Playing and desktop Now Playing queue rows
- [x] Next labelled "Vote to skip (1 of 2)"; vote toast; controls disabled per settings
- [x] Join on friends' now playing
- [x] Browser run with Playwright (see CHANGELOG 2026-10-21)

## Phase 3: Interior (Android)

- [x] Room models, socket `Settings` command, session state
- [x] Settings section and Invite panel on the Together screen
- [x] Adder picture in `QueueSheet` rows and on the now playing card
- [ ] Next label with the vote count (not done: skins keep "Next"; the vote shows as a toast and on the Together card)
- [x] Invite polling and notification (`invites` channel), opens the join
- [x] Join on `FriendsScreen` rows
- [x] `./gradlew assembleDebug`
- [ ] Emulator check (not run: low RAM)

## Phase 4: Walkthrough

- [x] `.docs/specs/room-sync.md` updated (scope, commands, protocol, decisions)
- [x] Web 0.4.1 and What's new; `android/release-notes/v0.4.27.md` (tag on push)
- [ ] Owner phone check with two or three people

## Change log

- 2026-10-21: plan approved in plan mode; IDs first written as A231-A235 by mistake (already used), renumbered A252-A256.
