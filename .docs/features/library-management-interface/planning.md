# Feature: Web Frontend — Library Management Interface

**One-line goal:** A full library management web app (not a lightweight admin panel) where you and your friends can manage songs and tags, control what plays in radio mode, bulk-upload new music, spot-check playback, and monitor streaming health.

**Scope decision:** Full parity with — actually beyond — the Android app in terms of *management* capability. Android stays the listening client; the web app is the control room.

**Frontend stack (resolved):** React + TypeScript, Vite, Tailwind CSS, TanStack Query. Flutter and Vue were both considered and ruled out — Flutter for both mobile (native Android APIs favor Kotlin) and web (React's admin/table/form ecosystem is a better fit here); Vue as a close second but React was chosen to continue.

---

## Phase table

| Phase | Covers | Done when |
|---|---|---|
| **Plan** | Confirm scope, list every capability, flag anything that needs new backend work before frontend work can start | This doc reviewed and open questions below are answered |
| **Structure** | Page/route map, new API endpoints required, data model changes (new columns/tables) | Every screen below has a matching endpoint listed, and every endpoint has a matching schema change (if any) |
| **Interior** | Component-level breakdown per page — what's on screen, what state it holds, what it calls | Each page's component list is detailed enough that Claude Code could build it without re-asking scope questions |
| **Walkthrough** | End-to-end user flow narrative, screen to screen | You can read it and picture actually using the app |

---

## Plan

### Capabilities (from your description, grouped)

**Library management**
- Browse full library (search/filter/sort — already covered by existing `/tracks` work)
- Edit tags per track (title/artist/album/custom fields) — was already planned as a gap Navidrome-fork-era, now applies directly to the custom backend
- Delete tracks
- Hide tracks (soft-delete — stays on disk/DB, excluded from browsing/streaming)
- Flag tracks "not recommended" (excluded from radio/shuffle specifically, but still visible/playable directly)

**Content operations**
- Bulk upload — select many files from the browser, backend ingests and scans them
- In-browser playback — confirm a track actually sounds right before trusting it

**Monitoring / diagnostics**
- Streaming health — is the server up, degraded, throwing errors
- Per-track stream details — format, bitrate, sample rate, transcode status, whatever helps debug a specific playback problem

### Resolved decisions

- **Permissions** — binary `is_admin` role. Destructive/shared-state actions (**delete, hide, not-recommended, upload**) are all admin-only via a `requireAdmin` guard. Read-only surfaces (browse, tag *viewing*, stream health dashboard, in-browser preview) stay open to any logged-in user.
- **Admin bootstrap** — first admin is set by a **CLI/script that flips `is_admin` directly in SQLite**. No user-management UI in scope for this feature; inviting users / changing roles from the UI is explicitly **deferred to its own future feature**.
- **Delete semantics** — **hard delete**: removes the DB row **and** unlinks the file from disk. Permanent. `hide` remains the reversible, non-destructive option for soft removal.
- **Upload destination** — already resolved by existing code, not new work. `POST /tracks/upload` already handles staging → tag extraction → filing into the library via `fileIntoLibrary`. Only new work there is adding the `requireAdmin` gate.

### Verified against current codebase (this pass)

- **Upload endpoint already exists and works.** `POST /tracks/upload` in [tracks.ts](../../../backend/src/routes/tracks.ts) — multipart → staging dir → `extractTrackTags` → `fileIntoLibrary` → `upsertTrack`. It takes one file per request; "bulk upload" is a frontend concern (fire N requests, show per-file progress/result), not a new backend endpoint.
- **No roles exist yet.** `users` table ([0001_create_users.sql](../../../backend/src/db/migrations/0001_create_users.sql)) has only `id`, `username`, `password_hash`, `created_at`. `is_admin` is new.
- **No `hidden` / `not_recommended` columns on `tracks` yet.** Both new.
- **`/health` is a one-line stub** (`{ status: 'ok' }`, [health.ts](../../../backend/src/routes/health.ts)) — no active-session or error tracking. The monitoring dashboard needs real instrumentation, not just a new route.
- **`tracks` already carries `format`, `play_count`, `last_played_at`** (browse.ts / 0004 migration) — a head start on per-track stream details, but bitrate/sample_rate/transcode-status/last-error are not tracked yet.

### Schema changes confirmed needed

- `users.is_admin` (boolean, default false) — no roles column at all currently
- `tracks.hidden` (boolean, default false)
- `tracks.not_recommended` (boolean, default false)
- `tracks.bitrate`, `tracks.sample_rate` — if not already captured by `extractTrackTags`/`trackFiling`, needed for per-track stream diagnostics
- `tracks.last_stream_error` (nullable text) — for diagnostics

`POST /tracks/upload` itself needs no code changes — only the new admin gate and the flags above.

### New backend work this implies

1. **Admin guard** — a `requireAdmin` preHandler (parallel to the existing `authenticate` decorator), applied to delete, hide/not-recommended writes, and upload.
2. **Delete** — `DELETE /tracks/:id`, admin-only. Unlink file from disk, remove DB row. Check current FK definitions before writing this: `favorites`/`playlist_tracks`/`play_history` rows referencing the track need `ON DELETE CASCADE` or explicit cleanup so a delete doesn't leave orphaned rows or fail on a constraint. Orphaned now-empty `artists`/`albums` rows are fine to leave as-is.
3. **Hide / not-recommended** — extend the existing tag-editor `PATCH /tracks/:id` payload rather than separate endpoints, admin-only. `listTracks`/browse queries need a `WHERE hidden = 0` filter; shuffle/radio logic (separate from this doc) needs to additionally filter `not_recommended = 0` when it's built.
4. **Stream health monitoring** — genuinely new surface, open to any logged-in user (not in the admin-gated list). Track active stream requests + recent error count/log in memory (or a small ring-buffer table), expose via `GET /admin/health`.
5. **Per-track stream diagnostics** — extend `GET /tracks/:id` response with bitrate/sample_rate/transcode status/last-streamed timestamp (already have `last_played_at`)/last error.
6. **`GET /tracks` needs real query params — found while designing Interior.** The doc originally assumed "search/filter/sort already covered by existing `/tracks` work," but `listTracks()` ([browse.ts](../../../backend/src/db/browse.ts)) only takes `limit`/`offset` with a fixed `ORDER BY title`. A management table needs `search` (title/artist/album substring), `sort` (title/artist/album/duration/dateAdded/playCount), `order` (asc/desc), `hidden` (all/only/exclude), `notRecommended` (all/only/exclude). This is a straightforward extension of the existing query, not a new endpoint — calling it out so it's not silently skipped.
7. **`GET /auth/me` needs `isAdmin` in the response.** The frontend has to know the current user's role to decide what to render (edit/hide/delete/upload controls). Currently returns only `{ id, username }`.

### Scope gap surfaced during Interior design

The original capabilities list said "Edit tags per track (title/artist/album/**custom fields**)." The current schema has no custom-field / key-value tag store — only fixed columns (`title`, `artist`, `album`, `track_number`, plus the new `hidden`/`not_recommended`). The Interior design below only covers the fixed fields that actually exist. Arbitrary custom tags would need a new `track_custom_fields` table and are treated as **out of scope for this pass** — flag if you actually need them; not implementing speculatively.

---

## Structure

| Page/section | Endpoint | Notes |
|---|---|---|
| Library browse/search | `GET /tracks?search=&sort=&order=&hidden=&notRecommended=&limit=&offset=` *(extend existing)* | Was pagination-only; needs real search/sort/filter params — see item 6 above |
| Tag editor | `PATCH /tracks/:id` *(new, requireAdmin)* | Also carries `hidden` / `notRecommended` writes |
| Delete track | `DELETE /tracks/:id` *(new, requireAdmin)* | Hard delete: DB row + file unlink. Check FK cascade behavior first |
| Bulk upload | `POST /tracks/upload` (existing, gate it) | Staging → tag extraction → filing already implemented. Only new work: `requireAdmin` gate |
| In-browser preview player | `GET /tracks/:id/stream` (existing) | Already built and verified working. No admin gate — any logged-in user |
| Stream health dashboard | `GET /admin/health` *(new)* | New surface — active sessions, recent errors. No admin gate — any logged-in user. Response shape sketched in Interior below |
| Per-track stream details | `GET /tracks/:id` (existing, extend) | Add bitrate/sample_rate/transcode status/last error |
| Current-user identity | `GET /auth/me` *(extend existing)* | Add `isAdmin` — frontend needs it to gate UI controls |

---

## Interior

Assumptions carried into this pass, stated rather than re-asked: JWT is kept in `localStorage` (simplest for a small self-hosted friends app; no httpOnly-cookie work needed on the backend) and the library page is a flat, sortable/filterable track table — not an artist/album drill-down browser, since the Android app already covers browsing and this app's job is management.

### App shell (used by every page)

- **`AuthProvider` / `useAuth()`** — holds `{ user: { id, username, isAdmin } | null, token, login(username, password), logout() }`. On load, if a token exists in `localStorage`, calls `GET /auth/me` to hydrate `user`; a 401 anywhere clears the token and bounces to `/login`.
- **`apiClient`** — thin fetch wrapper used by all TanStack Query hooks; attaches `Authorization: Bearer <token>`, centralizes JSON parsing and error shape (`{ error: string }` → thrown `ApiError`).
- **`AppShell`** — top nav (`Library`, `Upload` [hidden for non-admins], `Health`), current username, an "Admin" badge when `isAdmin`, Logout button. Renders `<Outlet />` for the active page plus the persistent `PreviewPlayerBar`.
- **`RequireAuth`** — route wrapper, redirects to `/login` when `user` is null.
- **`RequireAdmin`** — route/element wrapper, renders an "Admins only" message (not a silent redirect) when `user.isAdmin` is false — used on `/upload` and to gate individual controls elsewhere.
- **`PreviewPlayerBar`** — persistent footer bar, global via context (`usePreviewPlayer()`: `{ trackId, isPlaying, play(trackId), pause(), stop() }`). One `<audio>` element pointed at `/tracks/:id/stream`; any "Preview" button anywhere in the app calls `play(trackId)` rather than embedding its own player.
- **`ToastProvider`** — success/error toasts for saves, deletes, uploads.

### Page: `/login` — `LoginPage`

- **`LoginForm`**: username + password fields, submit → `auth.login()` → `POST /auth/login` → store token → redirect to `/`. Inline error message on 401. No register/create-account UI — `.docs/STATUS.md` and `.docs/reference/tech-stack.md` both resolve auth as a **"small fixed user list"**, with `POST /auth/register` explicitly documented as "an admin-only utility, not an open endpoint." New accounts are created by an admin invoking that endpoint directly (curl/script), the same pattern as the `is_admin` bootstrap — not exposed anywhere in this UI.

### Page: `/` — `LibraryPage`

**State:**
- Filter/sort state (drives the query, kept in the URL as query params so a view is shareable/bookmarkable): `search` (debounced 300ms), `sort`, `order`, `hidden` filter, `notRecommended` filter, `page`.
- `useTracksQuery(params)` — TanStack Query against `GET /tracks?...`.
- `selectedTrackIds: Set<number>` — local state, cleared on filter change.
- `activeTrackId: number | null` — which row's detail drawer is open.

**Components:**
- **`LibraryToolbar`** — search input, sort `<select>`, order toggle (asc/desc icon button), `hidden` filter dropdown (All / Visible only / Hidden only), `not-recommended` filter dropdown (All / Recommended only / Not-recommended only). All non-admin-gated — filters are read-only actions.
- **`BulkActionBar`** — appears only when `selectedTrackIds.size > 0`. "Hide selected" / "Un-hide selected" / "Delete selected" — each disabled with a tooltip ("Admins only") when `!isAdmin`; Delete opens `ConfirmDeleteDialog` with the count.
- **`TrackTable`** — paginated (reuses `limit`/`offset` from the query). Columns: select checkbox (admin only, hidden entirely for non-admins), Title, Artist, Album, Duration, Format, Hidden badge, Not-recommended badge, Play count, Date added, row actions.
- **`TrackRowActionsMenu`** (kebab menu per row): Preview (→ `PreviewPlayerBar.play(id)`), Edit (→ opens `TrackDetailDrawer` on the Tags tab), Hide/Unhide toggle (admin-only), Flag/unflag not-recommended (admin-only), Delete (admin-only → `ConfirmDeleteDialog`), Diagnostics (→ opens `TrackDetailDrawer` on the Diagnostics tab).
- **`TrackDetailDrawer`** (slide-over, tabbed):
  - *Tags tab* — `title`, `artist`, `album`, `track number` fields. Editable only when `isAdmin` (read-only display otherwise); Save → `PATCH /tracks/:id`, invalidates the list query and the drawer's own query on success.
  - *Diagnostics tab* — read-only for everyone: format, bitrate, sample rate, duration, file size, play count, last played at, last stream error (if any). Sourced from the extended `GET /tracks/:id`.
  - Preview button embedded in the drawer header, same `PreviewPlayerBar.play(id)` call.
- **`ConfirmDeleteDialog`** — states the target(s) by title, requires an explicit confirm click (no typed confirmation needed for a friends-scale library), calls `DELETE /tracks/:id` (looped for bulk), invalidates the list query.
- **`TrackTableEmptyState` / `TrackTableSkeleton` / `TrackTableError`** — standard query-state handling.

### Page: `/upload` — `UploadPage` (wrapped in `RequireAdmin`)

**State:**
- `queue: UploadItem[]` where `UploadItem = { file: File, status: 'queued'|'uploading'|'success'|'error', progress: number, result?: TrackSummary, error?: string }`.
- Upload concurrency capped (e.g. 3 in flight) so a big batch doesn't saturate the connection.

**Components:**
- **`UploadDropzone`** — drag-and-drop + click-to-browse. Client-side filters by the same extension set the backend enforces (`.flac .opus .mp3 .m4a .ogg`) before queuing, so obviously-wrong files never hit the network.
- **`UploadQueueList`** — one row per file: filename, size, status icon, progress bar (needs `XMLHttpRequest` for upload-progress events — `fetch` doesn't expose them), error message + Retry button on failure.
- On each success: invalidate the `LibraryPage` tracks query (so the new track shows up without a manual refresh) and show the parsed title/artist inline with a "View" link that opens `TrackDetailDrawer` for that track.
- **`UploadSummaryBanner`** — "12 uploaded, 1 failed" once the queue drains.

### Page: `/health` — `HealthPage`

**State:** `useHealthQuery()` — TanStack Query against `GET /admin/health`, `refetchInterval: 10_000` with a manual "Refresh now" override and an auto-refresh on/off toggle.

**Proposed `GET /admin/health` response shape** (needed to build this page without more back-and-forth):
```json
{
  "status": "ok",
  "uptimeSeconds": 123456,
  "activeStreams": 2,
  "recentErrors": [
    { "timestamp": "2026-09-03T12:00:00Z", "trackId": 42, "message": "ENOENT: file missing on disk" }
  ]
}
```
`status` is `ok` / `degraded` (recent errors present but streaming still works) / `down` (server itself unreachable — the frontend infers this from the request failing, not from the field).

**Components:**
- **`StatusBanner`** — big OK / Degraded / Down indicator, color-coded, uptime shown as "up for 1d 10h".
- **`ActiveStreamsCard`** — current active-stream count.
- **`RecentErrorsTable`** — timestamp, track (links to `TrackDetailDrawer` for that id if it still exists), message. Empty state: "No errors recently — good sign."

---

## Walkthrough

**1. Arrival — `/login`**
A signed-out visitor lands on `/login`. One form: sign in. There's no self-serve account creation here — the project's auth model is a **small fixed user list** (`.docs/reference/tech-stack.md`), and `POST /auth/register` is documented as an admin-only utility, not something this UI exposes. If you're not already a user, an admin creates your account out-of-band (curl/script), the same way the first `is_admin` flag gets set. On successful login, `AuthProvider` stores the session, `GET /auth/me` resolves (including the new `isAdmin` field), and the app redirects to `/`.

**2. Home base — `/` LibraryPage**
This is where you and your friends actually live. The track table reads its filter/sort/search state from the URL itself (so a link like `?search=piano&sort=artist` is shareable/bookmarkable, and back/forward behaves correctly) and calls the now-extended `GET /tracks?search=&sort=&order=&hidden=&notRecommended=`. Every row has a play button that hands off to the single shared `PreviewPlayerBar` — clicking a second track's play button doesn't spawn a second `<audio>` element, it just redirects the existing one, so there's never a chance of two tracks playing at once by accident.

Clicking a row (not the play button) opens `TrackDetailDrawer`. Two tabs: **Tags** (editable — title/artist/album/track number, `PATCH /tracks/:id`) and **Diagnostics** (read-only — format, bitrate, whatever `GET /tracks/:id` returns for stream debugging). If you're not admin, the drawer still opens — you can inspect and preview-play, you just can't save tag edits or see delete/hide/not-recommended controls, since those render conditionally off `useAuth`'s `isAdmin`.

Bulk actions (select multiple rows → hide / mark not-recommended / delete) only render for admins at all — a non-admin never sees a checkbox column that leads nowhere. Deleting is the one truly destructive path: `ConfirmDeleteDialog` states the target(s) by title, and on confirm hits `DELETE /tracks/:id`, which removes the DB row **and** unlinks the file from disk — permanent, no undo. `hide` stays the reversible option for anything less final.

**3. Getting music in — `/upload`**
Admin-only route; `RequireAdmin` bounces anyone else back to `/` with a toast. Drop a folder's worth of files on the dropzone, and each one gets its own row in a concurrent upload queue — individual progress bars, and a retry button on whichever ones fail rather than needing to redo the whole batch. Since `POST /tracks/upload` already handles staging → tag extraction → filing server-side, this page is purely a queue-and-progress UI over an endpoint that already works — no new backend logic riding along with it besides the admin gate.

**4. Is everything okay — `/health`**
Open to any signed-in user, not admin-gated — it's read-only operational data (active stream count, recent error log), not identity or destructive-action territory, so it doesn't need the same guard as delete/hide/upload. Polls `GET /admin/health` on a 10s interval with a manual refresh override. No action buttons — it's situational awareness, the "is the server currently on fire" check before you go dig further.

No loose threads remain from this pass — delete semantics, admin bootstrap, and health-page access are all confirmed and reflected above.

---

## Phase 5 — The admin power view (2026-09-15)

The four phases above predate the arcade-select split: `/` was still the
table this doc designed, before ledger decision **A18**
(`.docs/QUESTIONS.md`, 2026-09-11) moved it to `/manage` and put the arcade
music-select at `/` instead. A18 explicitly deferred sorting/filtering
improvements to "a later session" — this phase is that session.

**Scope:** turn `/manage`'s table into the real "full sorting search and
more" power view the owner asked for, reusing existing backend capability
end to end rather than building new surface. Zero new pages, zero new
routes.

**What shipped:**
- Column-header sorting (replacing the sort `<select>` + toggle button) for
  every `SortField`, including a new **Added** column — required adding
  `dateAdded` to the `TrackSummary` list response (`backend/src/db/browse.ts`
  + `frontend/src/types/api.ts`); the column already existed and was already
  sortable, just never projected into the list shape. The only backend touch
  in this phase.
- Debounced search (300ms) and full URL-persisted filter/sort/search/page
  state via `useSearchParams` — a filtered view is now a link.
- "Select all on this page" checkbox in the admin checkbox column.
- `hidden`/`notRecommended` toggles added to `TrackDetailDrawer`'s Tags tab —
  previously reachable only from the row menu / bulk bar, not the one place
  that already edits every other field on a track.

**Explicitly deferred** (`.docs/QUESTIONS.md` Q24, Q25 — both non-blocking):
a real bulk `PATCH`/`DELETE` backend endpoint (bulk actions still fire one
request per selected track today), and a library-wide stats surface (total
size, format breakdown). Neither was asked for; building either speculatively
would cut against this project's own "prefer surfacing over building" rule.

Full detail in `.docs/CHANGELOG.md` (2026-09-15 entry) and
`.docs/FUNCTIONLOG.md`.

---

## Change log

| Date | Change | Why |
|---|---|---|
| 2026-09-03 | Doc created | Initial scope capture from conversation |
| 2026-09-03 | Upload marked as existing, not new work | Checked actual code — `POST /tracks/upload` already does staging → tag extraction → filing |
| 2026-09-03 | Permissions resolved: binary `is_admin`, `requireAdmin` guard on delete, hide, not-recommended, and upload | Decided in conversation; broadened from an earlier "delete-only" draft to cover all destructive/shared-state actions |
| 2026-09-03 | Admin bootstrap resolved: CLI/script flips `is_admin` in SQLite directly | Decided in conversation; no user-management UI in scope |
| 2026-09-03 | Delete semantics confirmed: hard delete (DB row + file unlink) | Re-confirmed after a draft edit briefly reopened it |
| 2026-09-03 | Confirmed new schema: `is_admin`, `hidden`, `not_recommended`, plus `bitrate`/`sample_rate`/`last_stream_error` for diagnostics | Checked actual code |
| 2026-09-03 | Full profile/user-management UI explicitly deferred to a separate future feature | Keeps this feature's scope to library management, not identity management |
| 2026-09-03 | Interior phase written: app shell, all 3 pages component-by-component, `PreviewPlayerBar` design, `/admin/health` response shape proposed | Requested to proceed to Interior |
| 2026-09-03 | Found `GET /tracks` only supports pagination, not search/sort/filter as the Plan phase assumed; found `GET /auth/me` needs `isAdmin` added; flagged "custom fields" as unscoped (no schema support) | Surfaced while designing the library table and role-gated UI — needed to make Interior buildable without inventing unscoped features |
| 2026-09-03 | Removed self-serve register UI from `/login` (Interior + Walkthrough) | `.docs/STATUS.md` / `.docs/reference/tech-stack.md` resolve auth as a small fixed user list; `POST /auth/register` is documented as admin-only, not an open endpoint — a chat draft had incorrectly added public signup |
| 2026-09-03 | Delete semantics (hard delete: DB row + file) and `/health` access (any signed-in user, no admin gate) reconfirmed as final | Both had drifted back to "open" in a pasted chat draft that didn't match the saved doc; re-confirmed against the actual file to stop the doc flip-flopping |
| 2026-09-03 | Walkthrough phase written — all 4 phases (Plan/Structure/Interior/Walkthrough) now complete | Design pass |
| 2026-09-03 | Backend implemented and manually verified: migration `0006`, `requireAdmin`, `set-admin` CLI, `PATCH`/`DELETE /tracks/:id`, `GET /tracks/:id`, `GET /tracks` search/sort/filter, `GET /admin/health`, `isAdmin` on `GET /auth/me`, bitrate/sampleRate capture. Logged in `.docs/CHANGELOG.md`/`.docs/FUNCTIONLOG.md`/`.docs/STATUS.md`. Frontend not started. | Proceeding to implementation, backend-first per agreed build order |
| 2026-09-03 | Frontend scaffolded: Vite/React/TS/Tailwind v4/TanStack Query/React Router. Built and verified end-to-end (headless Chromium): auth, `AppShell`, `PreviewPlayerBar`, `LoginPage`, `LibraryPage` (read-only — search/sort/filter/pagination/preview), `UploadPage`, `HealthPage`. `TrackDetailDrawer` (tag editing, hide/not-recommended, delete) not yet built. Found and fixed a real gap: `<audio src>` can't carry the bearer token this backend requires — switched to a blob-fetch-based preview player. Logged in `.docs/CHANGELOG.md`/`.docs/FUNCTIONLOG.md`/`.docs/STATUS.md`. | Frontend scaffolding pass |
| 2026-09-03 | `TrackDetailDrawer` (Tags + Diagnostics), `TrackRowMenu`, `ConfirmDeleteDialog`, and admin-gated checkbox/bulk-action bar built and verified end-to-end (headless Chromium, admin + non-admin accounts, a real upload-then-delete round trip). Interior-phase scope for this feature is now functionally complete on both backend and frontend. Found and fixed a real backend bug in the process: `@fastify/cors`'s actual default `methods` excludes `PATCH`/`PUT`/`DELETE`, which had silently broken every such route (favorites, playlists, tracks) for any real browser this whole project — curl-only testing never caught it. Logged in `.docs/CHANGELOG.md`/`.docs/FUNCTIONLOG.md`/`.docs/STATUS.md`. Remaining: visual/UX polish pass — current styling is a functional dark/neutral Tailwind baseline, not yet reviewed as a final look. | Detail drawer implementation |
| 2026-09-03 | Visual/UX polish pass done — refined the existing dark neutral + amber accent direction (not a pivot) into a shared class layer (`.btn-*`/`.input`/`.card`/`.badge-*`), applied consistently across every page/component; proper favicon + page title. No functional changes. Verified via headless Chromium against every screen (dev servers needed restarting — the environment reset since the previous pass). Feature is now done end-to-end: backend, frontend functionality, and design. | Requested to proceed with the polish pass |
| 2026-09-03 | Animated login-page background added (`AnimatedHeroBackground`: drifting grid, equalizer motif, orbiting glow, periodic sweep — pure CSS keyframes, amber accent). User provided reference screenshots of a game's animated title screen and asked for a close copy including logo/font; declined reproducing the third-party trademarked logo/wordmark and built an original equivalent using the same animation technique instead. Verified all 4 layers running via computed styles. | User shared reference screenshots for the login background |
| 2026-09-03 | Full re-theme: flat navy blue + orange-red, replacing the dark neutral + amber palette everywhere. Every blur/glow/soft-shadow effect removed (login glow orb, backdrop-blur on header/modals/player bar, shadow-2xl/xl on cards/drawer/menu/toasts, input focus ring) — replaced with solid flat surfaces and plain borders. `AnimatedHeroBackground`'s orbit and sweep layers rebuilt as solid shapes instead of blurred/gradient ones. Same reference screenshots as the animated-background request, this time explicitly for palette + flat style, not the logo. Verified against every screen. | User asked to match the reference's color theme, pure flat/bright, no glow or blur |
| 2026-09-03 | Login page card moved from centered to left-anchored, echoing the reference's off-center composition without copying its proportions or text. New `.font-brand` (Fredoka via Google Fonts) applied to the "brainlessmusic" wordmark on both LoginPage and AppShell. User's own original HTML/CSS recreation of the reference (fonts + CSS shapes, not Konami assets) supplied as the layout/font reference. Verified computed font-family and full regression with the real account. | User shared their own recreation, asked for same layout feel + same title font |
| 2026-09-03 | Login page rebuilt — the off-center card attempt didn't match, per direct feedback. Replaced with the actual composition: wide white content band (left-anchored, `w-[60%]`) holding the form, new `TitleScreenPanel` component (scrolling navy mosaic + halftone dot-matrix soundwave silhouette, own shape) confined to the right half and layered above the band so it bleeds over its edge. `AnimatedHeroBackground` deleted (superseded). Verified via screenshot + full regression with the real account. | User: "nothing looks like what i was specifically specific before" |
| 2026-09-15 | Phase 5 added and built: `/manage` column-header sorting (incl. new `dateAdded` field on `TrackSummary` — the one backend touch), debounced + URL-persisted filter/sort/search/page state, select-all-on-page, and `hidden`/`notRecommended` toggles unified into `TrackDetailDrawer`. Bulk endpoint and library-stats surface deferred to `.docs/QUESTIONS.md` Q24/Q25. tsc/oxlint clean, backend suite 281/281, verified against the running Docker container. | A18 (`.docs/QUESTIONS.md`) explicitly deferred this to "a later session" — this was it |
