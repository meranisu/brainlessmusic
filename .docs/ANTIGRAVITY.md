# ANTIGRAVITY.md — brainlessmusic

Guidance for Antigravity (AGY) when working on this repo.

## What this is

Personal, self-hosted music streaming project — library, backend, web frontend, and Android app, built from scratch as a learning project. Not a public product: small-scale, for personal use and a couple of friends. Centerpiece feature: a Spotify-Jam-style synced "room" listening session.

See `.docs/STATUS.md` for current state and `.docs/reference/tech-stack.md` for full resolved decisions before assuming anything about the stack.

## Stack

| Layer | Tech |
|---|---|
| Backend | Node.js + TypeScript · Fastify |
| Backend libs | `music-metadata` (tags) · `fluent-ffmpeg` (transcoding) · `better-sqlite3` · JWT + bcrypt (auth) · `ws` / Fastify WebSocket (room sync) |
| Database | SQLite — FTS5 search, WAL mode |
| Frontend | React + TypeScript |
| Mobile | Kotlin + Jetpack Compose · Media3 (playback) · Retrofit/OkHttp · Room (local storage) · Hilt (DI) |
| Deployment | Docker (server only — NOT local dev) |

Repo layout:
- `backend/` — Fastify API server
- `frontend/` — React web app (library management, tag editing, room monitoring)
- `android/` — Kotlin/Compose app (the actual listening client)
- `.docs/` — planning, reference, and process docs

## Dev environment

- **Backend:** developed inside **WSL2 (Ubuntu)**.
- **Android:** developed natively on Windows via Android Studio.
- **Emulator ↔ backend:** the Android emulator reaches the WSL2-hosted backend via `http://10.0.2.2:<port>`, not `localhost`.

## Useful commands (for AGY's run_command tool)

```bash
# Backend
cd backend
npm install
npm run dev

# Android
cd android
./gradlew assembleDebug
```

## Backend conventions

- Own SQLite schema, designed from scratch.
- Room-sync session state kept **in-memory**, not persisted to SQLite.
- FTS5 virtual tables for search, kept in sync with main tables via triggers.
- WAL journal mode so reads aren't blocked by writes.
- JWT + bcrypt auth model.

## Feature build order

Follow the phased approach in `.docs/process/android-phased-plan.md` for the Android client. Room sync, offline downloads, and tag editing are tracked separately in `.docs/specs/` once each is designed.

## Planning workflow (Crucial for AGY)

When starting a non-trivial new feature, create `.docs/features/<feature-name>/planning.md` using the phase-plan template at `.docs/phase-plan-example.md`. Keep `.docs/STATUS.md` in sync whenever a feature's phase or status changes.

## Docs folder structure

```
.docs/
├── features/     — per-feature planning docs
├── history/      — how decisions evolved, changelogs
├── ops/          — hardware, deployment, networking
├── process/      — dev environment setup, phased build plans, workflow
├── reference/    — stable factual reference
├── screenshots/  — UI screenshots
├── specs/        — per-feature technical specs once designed
├── templates/    — spec/ADR/phase-plan templates
└── STATUS.md     — one-page current-state snapshot, entry point
```

## Where to look first

- Current project state: `.docs/STATUS.md`
- Guidance for Claude Code (co-worker agent): `.docs/CLAUDE.md`
- Full resolved stack + MVP scope: `.docs/reference/tech-stack.md`
- Why the backend ended up as a custom Node/TS build (not Navidrome): `.docs/history/backend-decision-history.md`
- Full feature brainstorm: `.docs/features/feature-brainstorm.md`
- Android build order: `.docs/process/android-phased-plan.md`
- WSL2 dev setup: `.docs/process/dev-environment.md`

## Antigravity-Specific Instructions

### 1. Co-working with Claude Code
- **Shared codebase:** You and Claude Code are actively collaborating on this repository.
- **Inspect git state first:** Before starting any work or writing code, always run `git status` and check recent changes. Claude Code may have left modified files, untracked work, or newly verified endpoints (e.g., in `backend/` or `android/`). Never blindly overwrite or revert active changes.
- **Respect established conventions:** Stay aligned with conventions established in `.docs/CLAUDE.md` and previous implementations (e.g., Fastify + SQLite WAL/FTS5, in-memory session state, WSL2 dev environment, JWT auth).
- **Keep `.docs/STATUS.md` synchronized:** When you implement or verify a feature, update `.docs/STATUS.md` immediately. Document what was done, status codes, env vars, and pending actions so Claude Code has clear context when resuming.

### 2. Cross-referencing Documentation
- **No assumptions:** The `.docs/` folder is the authoritative source of truth. Always cross-reference `.docs/STATUS.md`, `.docs/reference/tech-stack.md`, and relevant specs before making architectural or implementation decisions.
- **Planning workflow:** When starting a non-trivial feature, create or update `.docs/features/<feature-name>/planning.md` following the template in `.docs/phase-plan-example.md`.

### 3. Tool Usage & Execution
- **Tools:** Prioritize specific tools over generic ones. Use `grep_search`, `list_dir`, and `view_file` to navigate the repo. Use `write_to_file` and `replace_file_content` for file modifications.
- **Artifacts vs Repo files:** You can generate artifacts for temporary reasoning, but persist actual feature plans, specs, and code back into the repository/`.docs/`.
- **Subagents:** For broad research or parallel tasks, consider using subagents to preserve your main context window.
