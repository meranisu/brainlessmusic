# CLAUDE.md — brainlessmusic

Guidance for Claude Code when working on this repo.

## What this is

Personal, self-hosted music streaming project — library, backend, web frontend, and Android app, built from scratch as a learning project. Not a public product: small-scale, for personal use and a couple of friends, including on-the-road/bike-trip listening. Centerpiece feature: a Spotify-Jam-style synced "room" listening session.

See `.docs/STATUS.md` for current state and `.docs/reference/tech-stack.md` for full resolved decisions before assuming anything about the stack.

## Scope

The comparison point is Navidrome, but the *goal* is not to reimplement Navidrome. Navidrome is years of work by many people and carries a large surface — Subsonic API compatibility, multi-tenancy, plugins, transcoding profiles, a public product's worth of edge cases. This project deliberately skips all of that and keeps only the parts a handful of known people actually use.

Scope is defined by three releases, each with a done-when you check by using the app rather than by reading code. Full checklist: `.docs/process/development-roadmap.md`.

| | Release | Done when |
|---|---|---|
| **v0.1** | It works for me | A whole evening of listening to your own library in the browser, on the LAN, without reaching for a file manager |
| **v0.2** | It works away from home | Music from your own server, on your phone, on a bike ride |
| **v0.3** | It works with friends | Two people in different places hear the same song at the same time, either can skip |

**Explicitly out of scope** (decided, not open for re-litigation): Subsonic API compatibility, multi-tenancy, external auth providers, sharing links, jukebox mode, per-client transcoding profiles, a plugin system, and anything that treats this as a product for strangers.

**Everything else is backlog** — Android Auto, EQ, lyrics, smart auto-mixes, year-in-review, voice control, Wear OS and the rest live unranked in `.docs/features/feature-brainstorm.md` and are not scheduled. Ideas go to that pool; they reach the roadmap only when they serve the current release's done-when.

Two working notes that follow from this:

- **Prefer surfacing over building.** The backend runs well ahead of both clients — playlists, favorites, shuffle, and play history are fully built server-side and invisible to a user. Exposing an existing endpoint usually beats writing a new one.
- **Finish a release before starting the next.** Half of v0.1 plus half of v0.2 is worth less than all of v0.1.

## Stack

| Layer | Tech |
|---|---|
| Backend | Node.js + TypeScript · Fastify |
| Backend libs | `music-metadata` (tags) · `fluent-ffmpeg` (transcoding) · `better-sqlite3` · JWT + bcrypt (auth) · `ws` / Fastify WebSocket (room sync) |
| Database | SQLite — FTS5 search, WAL mode |
| Frontend | React + TypeScript |
| Mobile | Kotlin + Jetpack Compose · Media3 (playback) · Retrofit/OkHttp · Room (local storage) · Hilt (DI) |
| Deployment | Docker (server only — NOT local dev, see below) |

Repo layout:
- `backend/` — Fastify API server
- `frontend/` — React web app (library management, tag editing, room monitoring)
- `android/` — Kotlin/Compose app (the actual listening client)
- `.docs/` — planning, reference, and process docs (see Docs Folder Structure below)

## Dev environment

- **Backend:** developed inside **WSL2 (Ubuntu)**, not Docker, not native Windows Node. Docker is reserved for the eventual deployed server. See `.docs/process/dev-environment.md` for full setup.
- **Android:** developed natively on Windows via Android Studio — no Docker benefit here.
- **Emulator ↔ backend:** the Android emulator reaches the WSL2-hosted backend via `http://10.0.2.2:<port>`, not `localhost`.

## Useful commands

```bash
# Backend (run from WSL2)
cd backend
npm install
npm run dev

# Android — via Android Studio, or:
cd android
./gradlew assembleDebug
```

## Auth model

JWT + bcrypt. `POST /auth/login` returns a bearer token; client attaches `Authorization: Bearer <token>`. No Subsonic-style salt/token scheme — that was specific to an earlier Navidrome-based plan that's no longer in use (see `.docs/history/backend-decision-history.md`).

## Backend conventions (as they get established)

- Own SQLite schema, designed from scratch — not inherited from any third-party server.
- Room-sync session state (who's in a room, live playback position/queue) is kept **in-memory**, not persisted to SQLite. Redis is a future option only if it needs to survive restarts or scale beyond one process.
- FTS5 virtual tables for search, kept in sync with main tables via triggers — avoid `LIKE '%x%'` scans.
- WAL journal mode so reads (browsing/streaming) aren't blocked by writes (scans, tag edits).
- **Anything that writes to the filesystem takes its root as a parameter**, never a read of `config.libraryPath` / `config.artworkPath` from inside. `fileIntoLibrary` and `scanLibrary` both do. A caller must never have to infer *where* a function writes from an environment variable it didn't set.

## Testing rules (non-negotiable, learned the hard way)

On 2026-09-09 a test that did `rm -rf` on `config.libraryPath` was run directly with `tsx --test` instead of `npm test`, resolved to the real `LIBRARY_PATH`, and destroyed the owner's music library. All three of these exist because of that.

- **A test never deletes a directory it did not create.** Use `makeTempDir()` from `src/testing/harness.ts` and remove only what it returns. A destructive path derived from config is a live grenade regardless of how careful the caller intends to be.
- **`npm test` is the only supported way to run the suite.** It sets `DB_PATH`, `LIBRARY_PATH`, `ARTWORK_PATH` and `UPLOAD_STAGING_PATH` to throwaway locations under `backend/.test-tmp/`. Importing `src/testing/harness.ts` enforces this at import time, so a direct `tsx --test` run fails loudly instead of touching real data.
- **Remember that importing is enough to do damage**: `db/connection.ts` opens a database as a side effect of being imported, so any module that transitively reaches `db/` will touch whatever `DB_PATH` points at.

## Feature build order

`.docs/process/development-roadmap.md` is the ordering authority — work the first unticked box. Within it, the Android steps expand into the phased approach in `.docs/process/android-phased-plan.md` (Phase 0: connect + auth → Phase 1: browsing → Phase 2: playback → Phase 3: background/system integration → Phase 4: polish). Room sync, offline downloads, and tag editing are tracked separately in `.docs/specs/` once each is designed — don't build them opportunistically inside an earlier phase.

## Planning workflow

When starting a non-trivial new feature, create `.docs/features/<feature-name>/planning.md` using the phase-plan template at `.docs/phase-plan-example.md` — a phase table (Plan → Structure → Interior → Walkthrough) plus a change log for anything that shifts mid-build. Keep `.docs/STATUS.md` in sync whenever a feature's phase or status changes — it's the one file to check for an at-a-glance project state.

## Change tracking (CHANGELOG.md / FUNCTIONLOG.md)

Every backend/frontend code change (not doc-only commits) gets logged in both, newest entry first:

- **`.docs/CHANGELOG.md`** — one dated entry per change/commit: a short title, then bullets on what changed, why, and how it was verified (manual test steps, edge cases checked, cleanup confirmation).
- **`.docs/FUNCTIONLOG.md`** — one block per new/materially-changed function (closely-related trivial functions from the same file may be grouped into one block), using this exact shape:

  ```
  **Function:** `name()` — `path/to/file.ts`
  **Date:** YYYY-MM-DD
  **How added:** new feature | bug fix | refactor | hardening
  **Purpose:** what it does / what it backs.
  **Side effects:** DB writes, external calls, none, etc.
  **Before:** prior behavior, or "nothing — new function."
  **After:** what changed as a result.
  ```

Update both files as part of the same piece of work that makes the change — don't batch it up for later.

## Docs folder structure

```
.docs/
├── features/     — per-feature planning docs (.docs/features/<name>/planning.md)
├── history/      — how decisions evolved, changelogs
├── ops/          — hardware, deployment, networking
├── process/      — dev environment setup, phased build plans, workflow
├── reference/    — stable factual reference (resolved tech stack, schema, API shape)
├── screenshots/  — UI screenshots
├── specs/        — per-feature technical specs once designed
├── templates/    — spec/ADR/phase-plan templates
├── CHANGELOG.md  — dated log of every backend/frontend change (see Change tracking below)
├── FUNCTIONLOG.md — per-function log of what was added/changed and why (see Change tracking below)
└── STATUS.md     — one-page current-state snapshot, entry point
```

## Where to look first

- Current project state: `.docs/STATUS.md`
- Why the backend ended up as a custom Node/TS build (not Navidrome): `.docs/history/backend-decision-history.md`
- Full resolved stack + MVP scope: `.docs/reference/tech-stack.md`
- Database schema — every table, PK/FK, index, and flagged discrepancy, checked against the live DB not just migration files: `.docs/reference/database-schema.md`. Update it (table section + change log) in the same change whenever a migration is added.
- Unranked idea pool (not a plan): `.docs/features/feature-brainstorm.md`
- **What to build next: `.docs/process/development-roadmap.md`** — the ordered checklist, grouped into three releases
- What the system could do, by capability, with per-layer status: `.docs/reference/capability-map.md`
- Android build order: `.docs/process/android-phased-plan.md`
- WSL2 dev setup: `.docs/process/dev-environment.md`
