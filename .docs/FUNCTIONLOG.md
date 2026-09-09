# Function Log

Backfilled 2026-09-03 (didn't exist before). Covers functions added/materially changed in the 6 commits since the initial commit (2026-09-03 → 2026-09-03 — this project is one day old). Newest first. Log new/changed functions here going forward, per the planning workflow in `.docs/CLAUDE.md`.

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
