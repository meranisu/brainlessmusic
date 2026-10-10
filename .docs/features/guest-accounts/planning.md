# Guest accounts — planning

## Goal

A guest picks a name, gets a code from the admin, and uses that one code to sign in on the web and on Android as the
same guest. This turns a guest from "one nameless identity per device" into a light account: still listen-only, still
no password, but it survives a cleared browser or a reinstall and follows the person across devices.

Owner idea, 2026-10-11. Decided the same day:
[A67](../../QUESTIONS.md#a67--approving-a-guests-code-request-signs-that-device-straight-in) (approve signs the device in),
[A68](../../QUESTIONS.md#a68--guests-sign-in-with-the-code-alone) (code alone),
[A69](../../QUESTIONS.md#a69--a-guest-code-works-on-any-device-and-every-sign-in-is-logged) (any device, every sign-in logged),
[A70](../../QUESTIONS.md#a70--a-used-guest-code-works-until-revoked-or-idle-for-90-days) (works until revoked or idle 90 days).

## Phase Overview

| Phase | What it covers | Status | Checklist |
|---|---|---|---|
| 1. Plan | What changes from A13/A43, data shape, endpoints | Done | [Phase 1](#phase-1-plan) |
| 2. Structure | Migration, code reuse, requests queue, name, revoke | Done (local; not deployed) | [Phase 2](#phase-2-structure) |
| 3. Interior (web) | Guest form with name and request button, admin queue | Done (local; not deployed) | [Phase 3](#phase-3-interior-web) |
| 4. Interior (Android) | Same guest form on the title screen's Guest button | Not started | [Phase 4](#phase-4-interior-android) |
| 5. Walkthrough | Use it on both clients; docs; deploy | Not started | [Phase 5](#phase-5-walkthrough) |

---

## Phase 1: Plan

### What changes from today

| Today | After |
|---|---|
| A code lets **one device in, once** ([A43](../../QUESTIONS.md#a43--per-guest-codes-one-use-7-days-door-toggled-on-the-panel)) | A code is the guest's **reusable key**, on any device (A69) |
| Each device is its own guest ([A13](../../QUESTIONS.md#a13--one-guest-identity-per-device-not-a-shared-house-account)) | Devices using the same code are **the same guest**: one history, one resume position |
| Guests are `guest-a1b2c3` | Guests have a **name** they pick, or `Guest 4821` if left empty |
| Only the admin starts the flow (makes a code, sends it) | The guest can also **request** one; the admin approves (A67) |

Unchanged: guests stay listen-only ([A37](../../QUESTIONS.md#a37--guests-are-listen-only-what-do-they-keep)).
Unused codes still expire after 7 days. `ENTRY_CODE` (shared code) and the open door (toggle off) keep working as now;
with the door open, the name field is still shown and the guest walks straight in.

### The guest form (web and Android)

1. **Name.** Optional. Empty means `Guest` plus a random 4-digit number.
2. **Code.** Hidden at first. Two ways to reveal the text box:
   - "I have a code": shows the box. Typing a valid code signs in as that code's guest.
   - "Request a code": sends the request (with the name), then shows a waiting screen. When the admin approves, this
     device is signed in and the new code is shown once, with a note to save it for the other device. The text box
     is also shown, so a code the admin sends over chat works too.

Signing in with a code that is already in use joins that guest; the name typed on the form is ignored (A68: the code
alone signs in, the name is only a label). The guest can rename themselves later in Options.

### Data shape (sketch, verify against the schema before writing the migration)

Next migration number at time of writing is `0022`; check `backend/src/db/migrations/` first, since others are in
flight.

- `users.display_name TEXT` (nullable). Shown instead of `username` wherever a name is displayed. `username` stays the
  internal unique `guest-xxxxxx`, so a guest called "imran" can never collide with an account login.
- `guest_codes`: `used_by` now means "the guest this code belongs to". `used_at` is first use. A used code no longer
  stops working after one use. It stops when revoked, or when its guest's `last_seen_at` (stamped by `/auth/me`,
  `backend/src/db/users.ts:90`) is older than `GUEST_IDLE_DAYS`, checked at sign-in (A70).
- New `guest_code_signins` (A69): `id`, `code_id`, `user_id`, `platform` (`web` | `android`, sent by the client),
  `user_agent` (trimmed), `ip`, `created_at`. One row per successful code sign-in. Kept until the code is deleted.
- New `guest_code_requests`: `id`, `name`, `device_secret` (hash of a random value the requesting device keeps),
  `ip`, `created_at`, `status` (`pending` | `approved` | `denied`), `code_id` (set on approve). Pending requests
  expire after 24 hours.

### Endpoints (sketch)

- `POST /auth/guest` gains `name`. With a code: unused code mints the guest and binds it; used code signs in as its
  guest. Without a code: as today (open door or `ENTRY_CODE`).
- `POST /auth/guest/requests` (public, rate limited): `{ name }` → `{ requestId, secret }`.
- `POST /auth/guest/requests/:id/collect` (public, secret in the body): `pending` | `denied` | `approved` with `{ token, code }`
  returned **once**, then the request is closed.
- `GET /guest-codes` listing gains, per used code, the guest's name and its sign-ins (newest first).
- Admin: `GET /guest-codes/requests`, `POST /guest-codes/requests/:id/approve`, `POST .../deny`.
- `DELETE /guest-codes/:id` on a used code **revokes**: deletes the guest. Every device is signed out on its next
  request, since `backend/src/plugins/auth.ts:29` already refuses a token whose user no longer exists.
- `PUT /me/name` for the display name (guests and accounts).

### Security notes

- A reusable code is a password the admin also knows. Fine for listen-only access, not for anything more.
- Wrong-code guesses share the existing guest rate limit (`guestMintsPerHour`, `backend/src/config.ts:19`). 8
  characters from a 31-letter alphabet (`backend/src/db/guestCodes.ts:6-7`) is about 8.5 × 10¹¹ combinations, enough
  at that rate.
- Requests: per-IP rate limit and a cap on pending requests, so the public page can't flood the admin queue. The
  name is trimmed and length-limited (32 chars).
- The waiting device polls with a secret only it holds, so nobody else can collect the token from an approved
  request by guessing its ID.

- [x] Owner answers Q67-Q70 (A67-A70, 2026-10-11)
- [x] Schema checked against [database-schema.md](../../reference/database-schema.md) before the migration is written

## Phase 2: Structure

- [x] Migration `0022_guest_accounts.sql`: `users.display_name`, `guest_code_requests`, `guest_code_signins`
- [x] `redeemGuestCode` split (now `claimGuestCode`): first use mints and binds, later uses return the bound guest; idle-90-days refusal
- [x] Every code sign-in writes a `guest_code_signins` row (platform, user agent, IP)
- [x] `POST /auth/guest` accepts `name`; empty becomes `Guest NNNN`
- [x] Request endpoints, with rate limit, cap, 24-hour expiry, secret check, one-time token handoff
- [x] Admin approve and deny; listing shows pending requests
- [x] Revoke on a used code deletes its guest
- [x] `PUT /me/name`; `/auth/me` returns `displayName`
- [x] Tests: code reuse across two sign-ins gives one user; revoked code signs everyone out; request flow happy path,
      wrong secret, denied, expired, rate limited; name limits
- [x] `database-schema.md`, CHANGELOG, FUNCTIONLOG, server-guide env vars updated

## Phase 3: Interior (web)

- [x] Guest side of `frontend/src/pages/AccountSelectPage.tsx`: name field, "I have a code", "Request a code", waiting
      screen, code shown once after approval
- [x] Guest access card on `/users`: pending requests with Approve / Deny; used codes show the guest's name, its
      sign-in log (when, web or Android, device) and a Revoke button
- [x] Options: rename yourself
- [x] Display name used wherever a username is shown today

## Phase 4: Interior (Android)

- [ ] Guest form on the title screen's Guest button (`ui/login/LoginScreen.kt`) with the same three parts
- [ ] Waiting screen polls the request; survives the app going to the background
- [ ] Rename in Settings

## Phase 5: Walkthrough

- [ ] Request on the web, approve, sign in on Android with the code: same history and resume position on both
- [ ] Both sign-ins show in the admin log with the right platform
- [ ] Revoke: both devices drop to the title screen
- [ ] Spam the request button: rate limit holds
- [ ] Old guests (one-use codes, open door) still work untouched
- [ ] `cd backend && npm test`, `cd frontend && npm run build`, `npm run lint`, `./gradlew assembleDebug`
- [ ] Android release notes; deploy is the owner's `./scripts/deploy.sh` on smol

---

## Change Log

| Date | Phase affected | What changed | Why | Still fits the Plan phase? |
|---|---|---|---|---|
| 2026-10-11 | Structure | `PATCH /me/name` became `PUT /me/name`; the poll is `POST /auth/guest/requests/:id/collect` with the secret in the body, not a `GET` | Matches `PUT /me/theme`; keeps the secret out of URLs and logs | Yes |
| 2026-10-11 | Structure | A typed code that isn't right is a 401 even with the door open | Otherwise a typo quietly mints a stranger instead of the guest the person meant | Yes |
| 2026-10-11 | Structure | Added `POST /auth/guest/requests/:id/cancel` | Found while using the web flow: "Stop waiting" left a request in the admin queue that nobody would collect | Yes |
| 2026-10-11 | Interior (web) | New hint text uses `blue-300`, not `blue-400` | `blue-400` small text is 3.93:1 on the default card, below AA; the older uses elsewhere are untouched | Yes |
