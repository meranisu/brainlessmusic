# CODEX.md — brainlessmusic

Project reference for Codex, and a handoff reference for Claude Code and Antigravity.
Created 2026-10-12 after reviewing the project documentation and Claude's repository hooks.

The shared hard rules remain in [root CLAUDE.md](../CLAUDE.md), the detailed workflow in
[CLAUDE.md](CLAUDE.md), and collaboration rules in [AGENTS.md](../AGENTS.md) and
[ANTIGRAVITY.md](ANTIGRAVITY.md). This guide applies those rules to Codex. Current progress belongs in
[STATUS.md](STATUS.md), not in this file.

## Starting a session

1. Read the shared instructions, then run `git status --short` and inspect recent commits. Identify ongoing
   work before choosing files to edit; check again before editing shared documentation.
2. Read [STATUS.md](STATUS.md) and the [roadmap](process/development-roadmap.md). Follow the owner's requested
   task; when choosing the next feature, work the roadmap's first unticked box.
3. Read the [stack](reference/tech-stack.md), relevant feature plan and spec. For UI work, also read
   [DESIGN.md](../DESIGN.md). For schema or deployment work, read the corresponding reference or operations guide.
4. Search [QUESTIONS.md](QUESTIONS.md) for relevant open and answered decisions. Verify implementation claims
   against source code before relying on a function, endpoint, flag or migration number.

Use `rg` to locate text and read bounded sections. Never read CHANGELOG, FUNCTIONLOG, QUESTIONS or the frozen
status archive wholesale; search their topics/IDs and read the relevant entries. Keep verbose command output short.

## Project model

This is a personal self-hosted music streamer for the owner and a few friends. The web app is the control room;
Android is the listening client. The [roadmap](process/development-roadmap.md) defines release scope and observable
completion, while the [brainstorm](features/feature-brainstorm.md) is an unranked idea pool.

- Backend: Node.js/TypeScript and Fastify, SQLite through `better-sqlite3`, WAL, FTS5 and JWT/bcrypt authentication.
- Web: React/TypeScript. Android: Kotlin/Compose, Media3, Retrofit/OkHttp, Room and Hilt.
- Development: backend in WSL2; Android can build there, but actual phone/emulator use needs its own verification.
- Room state is authoritative in one server process and kept in memory; restarts end rooms. See the
  [room spec](specs/room-sync.md). Offline playback and queued plays have separate contracts in the
  [offline spec](specs/offline-downloads.md).
- UI follows the arcade music-select identity. Themes govern colours; Android skins govern the broader visual
  presentation. Follow [DESIGN.md](../DESIGN.md) and recorded decisions when extending either.

## How Claude Code works here

Root CLAUDE.md is the short session entry point; `.docs/CLAUDE.md` is the detailed reference. Claude's local
[settings](../.claude/settings.json) wire up the following hooks (inspected 2026-10-12):

| Stage | Source | Actual behavior |
|---|---|---|
| Before Bash | [guard-bash.mjs](../.claude/hooks/guard-bash.mjs#L11) | Blocks patterns for direct backend test runs, destructive library/mount deletes, secret-file reads, and destructive Docker commands without a brainless name. |
| After Edit/Write/MultiEdit | [track-edits.mjs](../.claude/hooks/track-edits.mjs#L6) | Records edited paths in a temporary list keyed by session. |
| On Stop | [stop-check.mjs](../.claude/hooks/stop-check.mjs#L22) | Combines tracked edits with changed/untracked Git paths, so shell edits and another agent's uncommitted work can enter the checks. |
| Stop checks | [stop-check.mjs](../.claude/hooks/stop-check.mjs#L53) | Type-checks touched backend/frontend source, flags missing CHANGELOG changes and missing schema updates for migrations, and blocks once without looping. |
| Git commit message | [commit-msg](../.githooks/commit-msg#L7) | Strips Claude/Anthropic attribution patterns when `core.hooksPath` points at `.githooks`. The written prohibition covers all AI attribution. |

These hooks enforce part of the workflow. Tests, Android builds, UI walkthroughs and FUNCTIONLOG content still
need explicit attention. Codex follows the same rules and performs the relevant checks directly; do not assume
Claude's hooks cover a Codex tool call. A legitimate hook problem needs the owner's say-so to change the hook.

## Shared safety and collaboration rules

- Backend tests run **only** with `cd backend && npm test`. The wrapper sets isolated database, library, artwork
  and staging paths; the [test harness](../backend/src/testing/harness.ts#L58) checks the `.test-tmp` isolation markers on import.
  Delete only test directories created through `makeTempDir()` and its returned cleanup.
- Never read `.env` files or other secret-bearing files, including signing passwords. Use documentation and
  non-secret source declarations to understand configuration.
- Filesystem writers receive their root as an argument; they must not discover the destination from
  `config.libraryPath` or `config.artworkPath` internally.
- Use only `brainless-*` containers. The local frontend uses port 5180; 5173 and 8080 belong to another project.
- Preserve other agents' changes. Avoid broad staging, reverts or cleanup. Re-read a shared file if it changes
  while working, then apply a scoped patch. Delegate independent research or clearly separated file ownership.
- Add no AI attribution to commits or PRs. Check exactly which files belong to the task before committing.
- Production runs on **smol** behind Cloudflare Tunnel. A backend/frontend push to `main` deploys automatically
  after CI and restarts production; a local rebuild does not deploy there. Ask before changing anything on smol.
  Use the [deployment guide](ops/cloudflare-tunnel-deployment.md) for the actual deployment and recovery procedure.

## Verification

Run the commands relevant to the change, from the repository root:

```bash
cd backend && npm test
cd backend && npm run build
cd frontend && npm run build
cd frontend && npm run lint
cd android && ./gradlew assembleDebug
```

Each line is a separate command. Backend/frontend scripts are defined in their respective `package.json` files.
For UI changes, run the app and use the feature. A compiled APK establishes build success; device behavior needs
a device walkthrough. Report only tests/builds/lint actually run in the current turn, with limitations stated plainly.
Cite `path:line` for code claims. For documentation-only changes, check the diff and references.

## Planning, decisions and records

Nontrivial features use [the phase-plan template](phase-plan-example.md): **Plan → Structure → Interior →
Walkthrough**. Maintain the feature's phase table, checklists and change log as the implementation evolves.

- Code changes update [CHANGELOG.md](CHANGELOG.md) and [FUNCTIONLOG.md](FUNCTIONLOG.md), newest first, using
  the formats in [Claude's detailed guide](CLAUDE.md#change-tracking-changelogmd--functionlogmd).
- New migrations update [database-schema.md](reference/database-schema.md) in the same change.
- Update [STATUS.md](STATUS.md) only when the table state or Next list moves; keep it under about 150 lines.
  Keep verification details in the logs and feature plan. Documentation-only changes need no code-log entry.
- Before asking an owner question, read relevant answered decisions and record a permanent `Q<n>` in
  [QUESTIONS.md](QUESTIONS.md). Record an answer immediately, with its date and where it landed; other docs link
  to the ID rather than duplicating the question. Preserve any explicit superseding decision.
- Follow the [release guide](ops/android-release.md) and Claude's release-note instructions when changing versions.
  User-facing notes, generated Android notes for the web, and verification belong in the same piece of work.

## Documentation map and reading historical notes

| Need | Reference |
|---|---|
| Current state and ordered work | [STATUS](STATUS.md), [roadmap](process/development-roadmap.md) |
| Owner decisions | [QUESTIONS](QUESTIONS.md), searched by ID/topic |
| Stack, schema and backend behavior | [tech stack](reference/tech-stack.md), [database schema](reference/database-schema.md), [server guide](reference/server-guide.md) |
| Feature intent and walkthroughs | `features/<name>/planning.md`, [room sync](specs/room-sync.md), [offline downloads](specs/offline-downloads.md) |
| UX and skin research | [DESIGN](../DESIGN.md), `features/player-skins/` |
| Development and Android sequencing | [dev environment](process/dev-environment.md), [Android phase plan](process/android-phased-plan.md) |
| Deployment and releases | `ops/`, especially [actual smol deployment](ops/cloudflare-tunnel-deployment.md#as-actually-deployed-2026-09-21) and [Android releases](ops/android-release.md) |
| Verification and review follow-ups | Relevant dated `process/*review*.md`, feature checklists, targeted CHANGELOG/FUNCTIONLOG entries |
| History and design templates | [backend decision history](history/backend-decision-history.md), targeted [frozen archive](history/status-archive.md), [phase plan](phase-plan-example.md), `templates/` |

The documentation review covered feature plans/research, process/reviews, operations, references, specs and
templates; the large ledgers and frozen archive were reviewed through topic searches and bounded excerpts.
Several older surveys, phase tables and review descriptions retain earlier assumptions. In particular,
[capability-map.md](reference/capability-map.md) and [setup-actions.md](setup-actions.md) are dated surveys;
the archive is frozen. Check dated completion notes, later decisions and source code before treating their prose
as current status. A review finding marked fixed is historical evidence; reproduce any unconfirmed finding first.

One verified example: the detailed Claude guide's import-time database warning describes older behavior.
As inspected on 2026-10-12, [connection.ts](../backend/src/db/connection.ts#L12) opens the database on first use through `getDb()`.
The isolated-test rule still applies. Report discrepancies explicitly instead of silently relying on stale text.

## Handoff to Claude or Antigravity

Use the shared feature plan and required logs for durable notes. State the result and files changed, checks actually
run, remaining verification, deployment impact, any decision IDs, and the next concrete step. Distinguish built,
tested, owner-confirmed and deployed. Keep progress out of this guide so it remains useful across sessions.
