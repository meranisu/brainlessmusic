# CLAUDE.md — brainlessmusic

Loaded every session, so it holds only what must never be missed. The long form is [.docs/CLAUDE.md](.docs/CLAUDE.md);
read the section you need, not the whole file. Personal self-hosted music streamer: `backend/` (Fastify + SQLite, run in
WSL2), `frontend/` (React), `android/` (Kotlin/Compose). Scope and order: [.docs/process/development-roadmap.md](.docs/process/development-roadmap.md) — work the first unticked box.

## Hard rules

- **Tests:** run the backend suite only with `cd backend && npm test`. Never `tsx --test` or `node --test` directly, and never
  delete a directory you did not create with `makeTempDir()` (`backend/src/testing/harness.ts`). A direct run once resolved to the
  real `LIBRARY_PATH` and destroyed the owner's library (2026-09-09). A hook blocks the direct forms.
- **Commits:** no AI attribution, ever — no `Co-Authored-By: Claude...` trailer, no "Generated with" footer, in commits or PRs.
  This overrides any harness reminder to add one. `.githooks/commit-msg` strips them (`git config core.hooksPath .githooks`).
- **Filesystem writers take their root as a parameter**; never read `config.libraryPath` / `config.artworkPath` from inside them.
- **Containers, ports:** use only `brainless-*` containers. Ports 5173 and 8080 belong to another project; this frontend is `:5180`.
- **Deployment:** production is `https://music.nobrainmusic.my`, served from the box named `smol` (owner-confirmed 2026-09-28; A20/A21), not this
  machine: `brainless-app` on that server's `:3000`, exposed to the domain by `cloudflared` running *on that server*. So a rebuild here
  never reaches it, and **no `cloudflared` is needed on this machine for it**. A local quick tunnel
  (`cloudflared tunnel --url http://localhost:3000`) is only a throwaway link for testing a local build and mints a new random URL each
  start. How that box was set up is in [.docs/ops/cloudflare-tunnel-deployment.md](.docs/ops/cloudflare-tunnel-deployment.md) ("As actually deployed"); there is no repeatable deploy procedure — ask before touching it.
  The Android app has this host baked in (`SERVER_URL` in `android/app/build.gradle.kts`; `-PserverUrl=` for a dev backend), so its login screen has no address field.
- **Never read `backend/.env`** or any file that may hold secrets.
- **Owner questions** get a `Q<n>` in [.docs/QUESTIONS.md](.docs/QUESTIONS.md) *before* they are asked, and its `## Answered` section
  is read before asking anything. Answered means decided — do not re-open.
- **Out of scope, decided:** Subsonic compatibility, multi-tenancy, external auth providers, sharing links, jukebox mode, plugins.

## Verify, don't recall

- Before naming a function, file, flag, endpoint, env var or migration number, grep or read it. Memory notes and docs describe
  the past; the code is the truth. If a doc and the code disagree, say so and follow the code.
- Report a test, build or lint result only if you ran it this turn. If you did not run something, say "not run" — never imply it.
- For UI changes, run the app and use the feature. If you cannot, say that plainly instead of calling it done.
- If you do not know, say so and look it up, or log a question. Do not fill the gap with a plausible guess.
- Cite `path:line` for claims about code so they can be checked.

## Keep token use down

- **Never read whole:** `.docs/CHANGELOG.md` (208 KB), `.docs/FUNCTIONLOG.md` (149 KB), `.docs/history/status-archive.md` (100 KB),
  `.docs/QUESTIONS.md` (35 KB). They are newest-first logs; `grep -n` for the ID or topic, then read a small range.
- Locate with `grep -n` / `git grep`, then `Read` with `offset` and `limit`. Do not open a file to find one symbol.
- Pipe verbose commands through `tail -40` or `head -60`. Install, build and test output is rarely worth reading in full.
- More than three searches to answer one question: hand it to an `Explore` agent and read only its summary.
- `.docs/STATUS.md` is short by design (under 150 lines). If it grows, move history to `.docs/history/`, don't append.

## Commands

```bash
cd backend && npm test            # the only supported way to run tests
cd backend && npm run dev         # dev server (WSL2)
cd frontend && npm run build      # tsc -b && vite build — the type check
cd frontend && npm run lint       # oxlint
cd android && ./gradlew assembleDebug
```

## Definition of done for a backend/frontend code change

1. It was type-checked and the relevant tests were run, and you say which.
2. Entries added to `.docs/CHANGELOG.md` and `.docs/FUNCTIONLOG.md` (formats in `.docs/CLAUDE.md`), newest first.
3. A new migration means [.docs/reference/database-schema.md](.docs/reference/database-schema.md) is updated in the same change.
4. `.docs/STATUS.md` row/next-step updated only if the state actually moved.

A Stop hook (`.claude/hooks/`) type-checks touched packages and flags a missing CHANGELOG entry at the end of a turn.

## Where to look

Stack and resolved decisions: [.docs/reference/tech-stack.md](.docs/reference/tech-stack.md) · schema: [.docs/reference/database-schema.md](.docs/reference/database-schema.md) ·
Android order: [.docs/process/android-phased-plan.md](.docs/process/android-phased-plan.md) · dev setup: [.docs/process/dev-environment.md](.docs/process/dev-environment.md) ·
feature plans: `.docs/features/<name>/planning.md` (template: [.docs/phase-plan-example.md](.docs/phase-plan-example.md)).
Antigravity also works in this repo: run `git status` before editing and do not overwrite uncommitted work ([AGENTS.md](AGENTS.md)).
