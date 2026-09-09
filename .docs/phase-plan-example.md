# Phase Plan — Template & Worked Example

> This is a **template**, not a real feature. Copy this structure into `.docs/features/<feature-name>/planning.md` when starting a non-trivial new feature (see CLAUDE.md's Planning Workflow). The example below uses a fictional "Statistic Menu" to show how the parts fit together — house-building analogy: Plan = blueprint, Structure = foundation, Interior = finishing, Walkthrough = final inspection before moving in.

## Goal

One sentence: what are we building and why. *(Example: "Add room sync so multiple listeners can share a synced playback session with skip capability.")*

## Phase Overview

| Phase | What it covers | Status | Est. Duration | Checklist |
|---|---|---|---|---|
| 1. Plan (blueprint) | Decide what data to show, where it comes from, rough API shape | Done | 1 day | [Phase 1](#phase-1-plan) |
| 2. Structure (foundation) | Backend: DB queries, endpoint, access control | In progress | 2 days | [Phase 2](#phase-2-structure) |
| 3. Interior (finishing) | Frontend: UI components, charts, styling | Not started | 2 days | [Phase 3](#phase-3-interior) |
| 4. Walkthrough (handover) | Testing, performance check, done-checklist, review | Not started | 1 day | [Phase 4](#phase-4-walkthrough) |

**Status values:** `Not started` → `In progress` → `Blocked` → `Done`. Keep this table current — it's the one thing to glance at to know where things stand, without reading the rest of the doc.

---

## Phase 1: Plan

- [x] Confirm what the menu needs to show (trip counts by unit, by month)
- [x] Confirm data source (existing `trips` table, no new schema)
- [x] Rough API shape agreed: `GET /api/stats?group_by=unit|month`

## Phase 2: Structure

- [x] DB query for `group_by=unit`
- [ ] DB query for `group_by=month`
- [ ] Access control (who can see whose stats)
- [ ] Wire up route + controller method

## Phase 3: Interior

- [ ] Stats page layout
- [ ] Chart component for unit breakdown
- [ ] Chart component for month trend
- [ ] Loading/empty states

## Phase 4: Walkthrough

- [ ] Bad-input / empty-data handling checked
- [ ] Query performance checked (no slow scans)
- [ ] Lint passes
- [ ] Tested manually end-to-end
- [ ] Security/access checked

*(This phase doubles as the "is this really done" checklist — see [[feedback_done_checklist]] in memory.)*

---

## Change Log

This is the part that handles your "new idea came up mid-phase" case. Every time something changes from what was originally planned, add a row here instead of quietly rewriting earlier sections — so there's a record of *why* things moved, and whether it affected other phases.

| Date | Phase affected | What changed | Why | Still fits the Plan phase? |
|---|---|---|---|---|
| 2026-09-02 | Interior | Switched unit breakdown from a table to a bar chart | User felt a table was harder to scan at a glance | Yes — API shape from Phase 1 (`group_by=unit`) didn't need to change, only the frontend component |

**Rule of thumb:** if a mid-phase change still fits inside what an earlier phase already locked in (e.g. the API shape), just log it here and keep moving — no need to reopen that phase. If it *doesn't* fit (e.g. the API needs a new field), that's a real scope change: update that earlier phase's checklist too, and flag it back to the user with a quick-pick question rather than deciding alone.
