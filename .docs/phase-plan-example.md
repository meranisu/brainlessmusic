# Phase Plan — Template & Worked Example

> This is a **template**, not a real feature. Copy this structure into `.docs/features/<feature-name>/planning.md` when starting a non-trivial new feature (see `.docs/CLAUDE.md`, "Planning workflow"). The example below uses a fictional "Statistic Menu" to show how the parts fit together — house-building analogy: Plan = blueprint, Structure = foundation, Interior = finishing, Walkthrough = final inspection before moving in.

## Goal

One sentence: what are we building and why. *(Example: "Add a stats page so the owner can see how many trips each unit made, by unit and by month.")*

**Done when:** one sentence you check by *using the app*, not by reading code. *(Example: "On the phone, the owner opens Stats and sees this month's trip count per unit without a reload.")*

## Not doing

What this feature deliberately leaves out, so it doesn't creep in mid-build. Ideas that come up go to `feature-brainstorm.md`, not here.

- Exporting stats to CSV
- Stats for other users' accounts

## Decisions

Owner decisions this plan rests on, by ID only — the content lives in `.docs/QUESTIONS.md`. Open ones get a `Q<n>` there first.

- A123 (stats visible to the owner only), Q124 (open: include guest plays?)

## Phase Overview

| Phase | What it covers | Status | Checklist |
|---|---|---|---|
| 1. Plan (blueprint) | Decide what data to show, where it comes from, rough API shape | Done | [Phase 1](#phase-1-plan) |
| 2. Structure (foundation) | Backend: DB queries, endpoint, access control | In progress | [Phase 2](#phase-2-structure) |
| 3. Interior (finishing) | Clients: web and/or Android UI | Not started | [Phase 3](#phase-3-interior-web) |
| 4. Walkthrough (handover) | Testing, done-checklist, docs, release | Not started | [Phase 4](#phase-4-walkthrough) |

**Status values:** `Not started` → `In progress` → `Blocked` → `Done`. Keep this table current — it's the one thing to glance at to know where things stand, without reading the rest of the doc. Mirror a status change in `.docs/STATUS.md`.

---

## Phase 1: Plan

- [x] Confirm what the menu needs to show (trip counts by unit, by month)
- [x] Confirm data source (existing `trips` table, no new schema)
- [x] Rough API shape agreed: `GET /api/stats?group_by=unit|month`

## Phase 2: Structure

- [x] DB query for `group_by=unit`
- [ ] DB query for `group_by=month`
- [ ] Access control (who can see whose stats)
- [ ] Wire up route + handler
- [ ] Tests added and passing (`cd backend && npm test`)

## Phase 3: Interior (web)

*Split per client. Delete the client this feature doesn't touch.*

- [ ] Stats page layout
- [ ] Chart component for unit breakdown
- [ ] Loading/empty states

## Phase 3: Interior (Android)

- [ ] Stats screen in the You tab
- [ ] Loading/empty/offline states

## Phase 4: Walkthrough

This phase is the "is this really done" checklist. It mirrors the Definition of Done in the root `CLAUDE.md`.

- [ ] **Done when** above checked by using the app
- [ ] **Tested on the phone** (not just the emulator or the browser) — or written down as "not phone-tested yet"
- [ ] Bad-input / empty-data handling checked
- [ ] Security/access checked
- [ ] Type check + lint pass (`cd frontend && npm run build`, `npm run lint`; `./gradlew assembleDebug`)
- [ ] `.docs/CHANGELOG.md` and `.docs/FUNCTIONLOG.md` entries added
- [ ] Migration added? → `.docs/reference/database-schema.md` updated in the same change
- [ ] Android release? → `android/release-notes/vX.Y.Z.md` written; web version bump? → `frontend/src/lib/webChangelog.ts` entry
- [ ] Open `Q<n>`s from this plan answered or still listed under Decisions

---

## Change Log

This is the part that handles your "new idea came up mid-phase" case. Every time something changes from what was originally planned, add a row here instead of quietly rewriting earlier sections — so there's a record of *why* things moved, and whether it affected other phases.

| Date | Phase affected | What changed | Why | Still fits the Plan phase? |
|---|---|---|---|---|
| 2026-09-02 | Interior | Switched unit breakdown from a table to a bar chart | User felt a table was harder to scan at a glance | Yes — API shape from Phase 1 (`group_by=unit`) didn't need to change, only the frontend component |

**Rule of thumb:** if a mid-phase change still fits inside what an earlier phase already locked in (e.g. the API shape), just log it here and keep moving — no need to reopen that phase. If it *doesn't* fit (e.g. the API needs a new field), that's a real scope change: update that earlier phase's checklist too, and flag it back to the user with a quick-pick question rather than deciding alone.
