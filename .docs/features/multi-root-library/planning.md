# Multi-root library: admin-added folders, including on external drives

**One-line goal:** Let an admin register more than one music folder — in
practice, folders on separate drives attached to the server — instead of the
single fixed `LIBRARY_PATH` the app started with, with the existing "gone
from disk" detection extended to cover a whole folder disappearing, not just
one file.

---

## Phase table

| Phase | Covers | Status |
|---|---|---|
| Plan | Confirm scope, what already exists vs. what's new | Done |
| Structure | `library_roots` table, root-scoped scan/reconcile, new routes | Done |
| Interior | Options page management UI, arcade empty-state | Done |
| Walkthrough | End-to-end verification | Done |

---

## Plan

**What already existed** (found before writing anything, not assumed):
`scanLibrary`/`fileIntoLibrary`/per-track missing-marking already took a root
path as an explicit parameter and never read `config.libraryPath`
internally — the file-level machinery was already root-agnostic. What
assumed exactly one root: no `library_roots` table, a single module-level
scan lock shared across all calls, and the missing-tracks guard ratio
computed over every track in the database rather than one root's own.

**Resolved decisions**, logged to `.docs/QUESTIONS.md` as Q26–Q28 (all
non-blocking, all built to the stated default):

- **Q26 — removing a root** detaches and marks its tracks missing; it does
  not delete them. Consistent with this app's existing hide-vs-delete
  philosophy — a registration decision isn't a decision to destroy music.
- **Q27 — uploads** stay single-destination (the original default root).
  Extra roots are for scanning in collections that already exist there, not
  upload targets.
- **Q28 — the empty-library "scanning" bar is indeterminate**, not a real
  percentage. `POST /library/scan` is one blocking request with no
  incremental progress reporting; building that would mean an async job plus
  a status-polling backend — a materially bigger, separate feature.

**What making a new drive visible requires, and can't be automated from
inside the app:** a Docker bind-mount into the container plus a restart —
documented in `.docs/ops/docker-local-build.md` and as a commented-out
example line in `docker-compose.yml`, rather than guessed at, since the
target deployment's actual drive layout isn't finalized (`.docs/ops/
infrastructure.md`).

---

## Structure

**Migration `0013_add_library_roots.sql`:** new `library_roots` table
(`id`, `path` UNIQUE, `label`, `added_at`, `last_scanned_at`,
`last_scan_error`); `tracks.root_id` (nullable FK). Foreign keys are enforced
here — better-sqlite3's bundled SQLite defaults it on, confirmed the hard way
when a first pass of test fixtures using non-existent root ids failed with
real `SQLITE_CONSTRAINT_FOREIGNKEY` errors, not the silent no-op an earlier,
incorrect comment elsewhere in this codebase had claimed.

**Seeding:** a migration is pure SQL with no access to the `LIBRARY_PATH` env
var, so the current single root is seeded by application code instead —
`ensureDefaultLibraryRoot()` in `db/libraryRoots.ts`, called once at boot
(inside `startLibrarySyncSchedule`, unconditionally, even when scheduled
scanning itself is disabled) — inserts a row for `config.libraryPath` and
backfills every pre-existing track's `root_id` to it.

**Root-scoped scan/reconcile:**
- `services/librarySync.ts`'s `running` lock became a `Set<number>` keyed by
  root id, not one shared boolean — independent roots (separate drives) have
  nothing to contend over.
- `services/scanner.ts`'s `reconcileMissingTracks` and `db/library.ts`'s
  `listTrackPaths` both take an optional/explicit root id to scope which
  tracks a sweep judges — without this, one root's outage would be diluted
  (or a healthy root's guard wrongly tripped) by every other root's count.
  Covered by three new tests in `services/reconcile.test.ts`.
- `startLibrarySyncSchedule` loops over every registered root on each tick,
  reading the list fresh each time — a root added from the UI is picked up
  by the next scheduled tick with no restart needed.

**New routes** (`routes/library.ts`, all admin-only): `GET /library/roots`,
`POST /library/roots`, `POST /library/roots/:id/scan`,
`DELETE /library/roots/:id`. `POST /library/scan` was repurposed to loop over
every root; `GET /library/missing` now names which root each row belongs to.

**Uploads** (`routes/tracks.ts`) now look up the default root's id and pass
it through explicitly, since `upsertTrack` requires a `rootId`.

---

## Interior

**`OptionsPage.tsx`** gained a `LibrarySection`, admin-gated — the first
whole admin-only section on this page (previously only one inline "Admin"
badge existed). Polls `GET /library/roots` the same way `HealthPage` already
polls `GET /admin/health` (`refetchInterval`, no new pattern). Per root:
label/path, status, track count or "Scanning…", Rescan and Remove buttons.
Remove opens a small inline confirm dialog with accurate copy (nothing on
disk is touched) — `ConfirmDeleteDialog` was not reused, since its wording is
specific to actually deleting a file. An "Add folder" row takes a path and
optional label.

**`LibraryPage.tsx`** (the arcade select) extended its existing empty state
— already there as static text, never a blank screen — to poll
`GET /admin/health`'s `librarySyncRunning` field (open to any signed-in user,
guest included, unlike the root-management endpoints) only while the library
is empty. Mid-scan: an indeterminate sweep bar (`.scan-sweep`, `index.css`).
Otherwise: "No music in the library yet," with a link to Options for an
admin, or "Ask an admin to add some" for anyone else.

---

## Walkthrough

An admin opens Options, sees **Library folders**, and adds a path — the one
already mounted by default, or a new one after adding a `docker-compose.yml`
volume line and restarting for a second drive. Adding a folder scans it
immediately: new tracks appear in the arcade select and `/manage` right
away. Renaming or moving the underlying folder and clicking Rescan (or
waiting for the scheduled sweep) flags everything under it missing, the same
"kept, not deleted" treatment a single vanished file already got — favorites,
playlists and history survive. Removing a root's registration entirely
detaches its tracks (still missing, no longer attributed to any root) without
touching whatever is or isn't still on disk. A guest or fresh install with no
music yet sees the arcade screen's own sweeping bar while a scan runs, then
either their library or a plain "no music yet."

---

## Change log

| Date | Change | Why |
|---|---|---|
| 2026-09-15 | Doc created; Plan/Structure/Interior/Walkthrough written in one pass, alongside the implementation | Feature built end-to-end in the same session it was scoped |
| 2026-09-15 | Q26/Q27/Q28 resolved to their stated defaults, logged in `.docs/QUESTIONS.md` | Non-blocking — proceeded on stated assumptions rather than pausing implementation |
| 2026-09-15 | Discovered mid-implementation: foreign keys are actually enforced (an earlier comment elsewhere in this codebase claiming otherwise was wrong) — surfaced by real `SQLITE_CONSTRAINT_FOREIGNKEY` failures in updated test fixtures, not by re-reading the docs | `testing/harness.ts`'s `resetDatabase()` also needed `library_roots` added to its deletion list, a real gap the same failures surfaced |
| 2026-09-15 | Backend: migration, `db/libraryRoots.ts`, root-scoped `scanner.ts`/`librarySync.ts`, new routes, upload route updated. 284/284 backend tests passing (281 prior + 3 new root-scoping tests). Frontend: `OptionsPage` Library section, `LibraryPage` scan-aware empty state, new types. tsc/oxlint clean, verified against the running Docker container. | Implementation pass |
| 2026-09-15 | Found by manually simulating a removed drive against the running container (deploying and testing end-to-end surfaced this; the test suite alone had not): rescanning a root whose folder had been deleted entirely threw an uncaught `ENOENT` instead of the graceful "unreachable" outcome `reconcileMissingTracks` already had. Fixed with a `stat` guard in `syncLibrary` before attempting the scan. New test `services/librarySync.test.ts` reproduces it. 285/285 backend tests passing. | End-to-end verification against the live container, not just the test suite |
