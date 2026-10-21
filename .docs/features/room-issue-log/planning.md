# Room issue log (Listen together)

## Context
v0.4.27 rooms broke on phones and nothing recorded why: `RoomSocket.parseRoom()` swallowed the Gson error, and
the invite list failure (Q261) is still unexplained. The owner asked for a room issue log. Today no client and no
server logs any room error (no `Log.*` in `rooms/`, no `console.*` in `roomClient.ts`, no `fastify.log` in
`routes/rooms.ts`). Goal: every room failure that is now dropped or only shown as a toast leaves one row the admin
can read on the Logs page, with enough detail (kind, HTTP status, exception text, app version) to diagnose it
without a USB cable.

Copy the playback-failures pattern (`backend/src/db/playbackFailures.ts`, `POST /tracks/:id/playback-failure` in
`routes/tracks.ts:595`, `GET /admin/playback-failures` in `routes/health.ts:28`, `LogsPage.tsx`).

## Backend
1. Migration `0044_create_room_issues.sql`: `id`, `user_id` (FK users), `source` (`android` | `web` | `server`),
   `kind` TEXT, `room_code` TEXT NULL, `message` TEXT, `detail` TEXT NULL, `http_status` INTEGER NULL,
   `app_version` TEXT NULL, `user_agent` TEXT NULL, `created_at`. Index on `created_at`.
   Update `.docs/reference/database-schema.md`; add the table to the user-delete paths (`db/users.ts:197`, `:312`)
   and the cleanup list (`db/library.ts:587`), and to the test reset in `testing/harness.ts:19`.
2. `backend/src/db/roomIssues.ts`: `recordRoomIssue`, `countRoomIssues`, `listRecentRoomIssues(limit, offset)`.
   Same 1000-row cap and clipping as playback failures (message 500, detail 1000, short fields 200).
3. `POST /rooms/issues` in `routes/rooms.ts`: `fastify.authenticate` (guests too, they join rooms), manual
   `typeof` checks, `kind` must be in a fixed list, 30/min per user via `createRateLimiter()`, 204.
   `request.log.warn` each one.
4. Server-side rows (`source: 'server'`) in the WS route: fatal `closeWith` reasons `no-hello`, `rate-limited`,
   `unauthorized` (`routes/rooms.ts:222-317`) and `{type:'error'}` frames (`bad-json`, `unknown-type`). Not
   normal endings (`left`, `ended`, `kicked`, `replaced`) and not command `rejected` (normal flow, noisy).
5. `GET /admin/room-issues` in `routes/health.ts`, admin only, `{ issues, total }`.

Kinds: `parse-failed`, `socket-failed`, `socket-closed`, `server-error`, `request-failed`, `server-closed`.

## Android
1. `ApiService.reportRoomIssue(@Body RoomIssueReport)`; DTO in `data/remote/dto/` (R8 safe there).
2. `rooms/RoomIssues.kt`: `report(kind, message, detail?, httpStatus?, roomCode?)`. Fire-and-forget on an
   app scope, swallow its own errors, `Log.w("RoomIssues", ...)` every time so `adb logcat` also shows it.
   Dedupe: same `kind + message` at most once per 60 s, so a reconnect loop sends one row, not hundreds.
   Sends `BuildConfig.VERSION_NAME`.
3. Report from the points the explore found swallowed:
   - `RoomSocket.kt`: JSON parse (169) and `parseRoom` (223) with the exception text and the message `type` plus
     its first 300 chars; `onFailure` (176) with throwable + `response?.code`; `onClosed` (174) when the code is
     not 1000/4000; `{type:'error'}` frames (add the `when` case).
   - `RoomSession.kt`: `myRoom()` (93), create room (108), lookup non-404 (125), REST leave (141).
   - `RoomInvites.kt`: invitable list, send invite, poll, with HTTP status from `ConnectionException`.
   UI behaviour unchanged.

## Web
1. `reportRoomIssue()` in `frontend/src/lib/apiClient.ts`, same fire-and-forget shape as `reportPlaybackFailure`
   (`:201`), plus `console.warn`. Same 60 s dedupe.
2. Call it in `lib/roomClient.ts` (JSON parse 241, `onclose` with non-normal code 248, `{type:'error'}` frames,
   REST leave 205), `RoomProvider.tsx` (`/rooms/mine` 152, create 169), `TogetherPage.tsx` (lookup non-404,
   invitable list error, send invite error), `InviteBanner.tsx` (poll error, decline).
3. `LogsPage.tsx`: new "Room issues (total)" section after Playback failures, same paged table: time, user,
   source, kind, room, message, detail (expandable), HTTP, version. `RoomIssueEntry` type in `types/api.ts`.

## Not in scope
Android playback-failure reporting (separate gap). Offline queueing of reports: if the network is down the
report is lost, logcat still has it. Fixing the missing toast texts for `no-hello` / `rate-limited`.

## Verification
- `cd backend && npm test`: new tests in `db/failureLogs.test.ts` (record, cap, paging) and a route test (204,
  bad kind 400, rate limit 429, admin-only GET, guest allowed), server row on a WS `no-hello` close.
- `cd frontend && npm run build && npm run lint`; browser check with Playwright: force a lookup failure and a
  bad WS frame, see rows on Logs page.
- `cd android && ./gradlew assembleDebug` and `assembleRelease` + dexdump that `RoomIssueReport` stays concrete.
- Phone: not testable by me; owner installs the release and the next invite-list failure shows on the Logs page.
- Docs: CHANGELOG, FUNCTIONLOG, database-schema, STATUS row, Q261 note, release notes; save plan to
  `.docs/features/room-issue-log/planning.md`.

## Unresolved questions
- Release as v0.4.29 straight after (push ships web + backend to smol, tag builds the APK)? Default: yes.
