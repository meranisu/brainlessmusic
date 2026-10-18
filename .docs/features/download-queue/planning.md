# Download queue management (Android)

## Goal

Give the Downloads tab real control over the queue: pause, resume or stop one song, see what each album and playlist takes on
the phone, and let downloads wait for Wi-Fi.

**Done when:** on the phone, the owner pauses one song of a 10-song album download while the others finish, sees the size on the
album tile, and with Wi-Fi only on, a queued download waits on mobile data and carries on when Wi-Fi returns.

## Not doing

- Priority or reorder of the queue (Q208 option c). Stays in `feature-brainstorm.md`.
- Anything on the web or the backend.
- Changing precaching: it keeps its own any-network rule (A218).

## Decisions

- A219 (a, b and d; stop asks first; shared song counts in both groups). A85 still holds while Wi-Fi only is off.

## Phase Overview

| Phase | What it covers | Status | Checklist |
|---|---|---|---|
| 1. Plan (blueprint) | Scope picked, approach written | Done | [Phase 1](#phase-1-plan) |
| 2. Structure (foundation) | Repository: stop reasons, bytes, requirements, setting | Done | [Phase 2](#phase-2-structure) |
| 3. Interior (finishing) | Queue panel and sheet, tile sizes, group page, settings switch | Done | [Phase 3](#phase-3-interior) |
| 4. Walkthrough (handover) | Unit tests, phone walkthrough, release | In progress | [Phase 4](#phase-4-walkthrough) |

## Phase 1: Plan

- [x] Q208 answered as A219
- [x] Approach: Media3 stop reasons for per-song pause, `Download.bytesDownloaded` for sizes, `Requirements.NETWORK_UNMETERED` for Wi-Fi only

## Phase 2: Structure

- [x] `TrackDownload.bytes` and `isStopped`; `pause()` and `resume()` in `DownloadRepository`
- [x] `GroupDownload.Paused`
- [x] `download_wifi_only` setting; `downloadRequirements()`; manager built from it in `DownloadModule`; repository follows changes

## Phase 3: Interior

- [x] Queue panel rows with pause, resume, retry, stop (confirm), "See all" sheet
- [x] Size on tiles and group page header; Paused badge and status
- [x] Group page song menu: Pause, Resume, Stop download
- [x] Settings, Downloads: Wi-Fi only switch

## Phase 4: Walkthrough

- [x] Unit tests for the pure parts
- [ ] Phone: pause one song while others run, resume, stop one (album offers it again)
- [ ] Phone: size on tile grows while downloading
- [ ] Phone: Wi-Fi only on, mobile data, queue shows "Waiting for Wi-Fi"; back on Wi-Fi it resumes; app killed on mobile data stays idle
- [ ] Commit, tag with v0.4.23 (release note already written)

## Change log

- 2026-10-18: planned and built in one session.
