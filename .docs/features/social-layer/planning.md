# Social layer, part 1: friends' now playing + activity feed

## Context
Friend called profiles "Spotify with Twitter functions / Steam for songs"; owner wants a social layer (memory social-layer-idea).
Decided 2026-10-21: A239 build live now playing + activity feed first (reactions later); A240 everyone sees everyone, no follows;
A241 one "Hide my activity" switch per account, guests never appear. Only the People list with last-listened exists today
(`backend/src/db/profile.ts:117`). First step on approval: save this plan to `.docs/features/social-layer/planning.md`.

## Backend
1. Migration `0043_add_user_hide_activity.sql`: `ALTER TABLE users ADD COLUMN hide_activity INTEGER NOT NULL DEFAULT 0`.
   Update `UserRow` (`backend/src/db/users.ts:9`) and `.docs/reference/database-schema.md`.
2. `PUT /me/activity-visibility {hidden: boolean}` modelled on `PUT /me/theme` (`backend/src/routes/auth.ts:503`), `requireAccount`.
   Return `hideActivity` in `/me`.
3. **Now playing, in memory** (no table): new `backend/src/services/nowPlaying.ts` — `Map<userId, {trackId, positionMs, paused, updatedAt}>`,
   entry expires 90 s after last update. Fed from the existing `PUT /me/playback-state` (`backend/src/routes/playbackState.ts:53`),
   which web already sends every 10 s (`frontend/src/components/PlayerBar.tsx:94`) and Android via `PlaybackResume.kt`. Add a
   `paused` field to that body (optional, default false); `DELETE` clears the entry. Check Android save cadence; if it only
   saves on pause/exit, add a 10–15 s save while playing.
4. `GET /social/now-playing`: accounts only, excludes self, guests, `hide_activity=1`, hidden tracks. Returns
   `[{user: {id, displayName, avatarId}, track: {id,title,artist,album,coverId}, positionMs, paused, updatedAt}]`.
   Clients poll every 15 s while the screen is open (no new websocket; room socket at `rooms.ts:155` stays room-only).
5. `GET /social/feed?before=<iso>&limit=30`: one SQL `UNION ALL`, newest first, cursor by timestamp:
   - plays from `play_history` (skip `skipped=1`; collapse same user+track within 30 min),
   - likes from `favorites.created_at`,
   - playlists going public from `playlists.public_at` (`0034_add_playlist_public.sql`).
   Same exclusions as above. New `backend/src/db/socialFeed.ts`, route `backend/src/routes/social.ts`, registered in `app.ts`.
   Index check: `play_history(played_at)` — add in 0043 if missing.
6. Tests `backend/src/routes/social.test.ts` (pattern: `profile.test.ts`, `buildApp` + `app.inject`): guest refused (403),
   hidden user absent from both, guest plays absent, expiry of now playing, skipped plays absent, hidden tracks absent,
   cursor paging, private playlists absent.

## Web
- New `frontend/src/pages/FriendsPage.tsx` (or a "Friends" section on the People page — follow `PeoplePage.tsx`):
  top strip "Listening now" (avatar, name, song, live-ish progress bar, tap song to play, tap person to open `PersonPanel`),
  below it the feed (infinite scroll via react-query `useInfiniteQuery`). Nav entry beside People.
- Settings / profile edit: "Hide my activity" toggle.
- Send `paused` in the existing playback-state save.
- Read DESIGN.md and antislop UI first; check in browser with Playwright (seeded users).

## Android
- `ApiService.kt`: `nowPlaying()`, `feed(before)`, `setActivityHidden()`; `paused` in the playback-state body.
- New `ui/social/FriendsScreen.kt` (pattern: `ui/people/PeopleScreen.kt`), same two sections, poll 15 s while visible.
- Toggle in profile/settings. Release notes `android/release-notes/vX.Y.Z.md`, release tag on push.

## Docs (definition of done)
CHANGELOG, FUNCTIONLOG, database-schema, STATUS row, brainstorm row status, `.docs/features/social-layer/planning.md`.

## Verification
- `cd backend && npm test` (wait for idle; shared test.db collides with parallel sessions).
- `cd frontend && npm run build && npm run lint`; Playwright: two seeded users, one plays, other sees now playing + feed; hide switch removes them.
- `cd android && ./gradlew assembleDebug` (check `free -h` first). Phone test: not possible here unless adb attached — say so.
- Push note: touches backend+frontend → auto-deploys to smol. Ask before pushing (perf commits are still held, A231).

## Unresolved questions
- Feed entries for plays: show every play, or one per person per song per day? (plan: collapse within 30 min)
- Web placement: own "Friends" page, or top of People?
- Push now, or keep with the held perf commits?

## As built (2026-10-21), where it differs from the plan above
- No `services/nowPlaying.ts` and no `paused` field: `listListeners()` in `backend/src/services/streamMonitor.ts` already
  holds who is playing (30 s TTL, dropped at once on `playing: false`). Android already saves every 10 s
  (`ResumeSavePolicy.kt`), so no client change was needed for now playing.
- Plays collapse to one per person per song per day (A242), not "within 30 min".
- Web is its own Friends page under More (A243); the hide switch sits on that page. Android opens it from You.
- Answers to the unresolved questions: A242, A243. Push: not decided.
