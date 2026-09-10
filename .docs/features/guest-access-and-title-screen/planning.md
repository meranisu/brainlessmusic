# Phase Plan — Guest access & the title screen

## Goal

Replace username/password sign-in with a **one-click guest entry** — a randomised
session token minted on demand, no account to create and nothing to remember —
behind an **arcade-style title screen** whose logo and enter button carry the
animation the login form currently has only in its background panel.

Two people use this server. Neither of them wants to type a password, and
neither of them has ever looked at another person's profile. The account system
is carrying cost nobody is paying for.

## The one idea that makes this cheap

Everything user-scoped in the backend reads `request.user.id` — favorites,
playlists, play history, scrobbles, resume state, media tokens, the admin gate.
That is **eight route files and one plugin**, none of which care *how* the id
was obtained.

So a guest is not a new concept in the data model. It is a `users` row with no
password, minted on demand. `POST /auth/guest` signs the same JWT that
`POST /auth/login` signs, and every downstream file is untouched.

| Layer | Changes? |
|---|---|
| `routes/favorites.ts`, `playlists.ts`, `history.ts`, `playbackState.ts`, `tracks.ts` (scrobble), `stats.ts` | **No** |
| `services/token.ts`, `plugins/auth.ts` | Only `requireAdmin`'s guarantee (guests are never admin — already true, since `is_admin` defaults to 0) |
| `db/users.ts`, `routes/auth.ts` | Yes — new mint path, login refuses guest rows |
| `users` table | One migration: `kind`, `last_seen_at` |
| Frontend `LoginPage` / `SignupPage` / `RequireAuth` | Replaced by `TitleScreen` |

## What this deliberately does *not* buy

- **Not anonymity.** A guest still has a row and still accumulates history. It
  is a login without a password, not a session without an identity.
- **Not a security boundary.** Anyone who can reach the server can enter. On the
  LAN that is the status quo dressed differently. Before roadmap box 13 it is a
  real exposure — see [Security](#security-the-part-that-actually-matters).
- **Not the end of accounts.** The `users` table stays, and the owner keeps a
  password login, because `POST /tracks/upload` and `/library/scan` must not be
  reachable by whoever clicked "enter" ([Q15](../../QUESTIONS.md#q15--how-does-the-owner-keep-admin-access-once-the-login-screen-is-gone)).

## Phase Overview

| Phase | What it covers | Status | Est. Duration | Checklist |
|---|---|---|---|---|
| 1. Plan (blueprint) | Identity model, admin path, entry-gate policy | Blocked on Q14–Q17 | — | [Phase 1](#phase-1-plan) |
| 2. Structure (foundation) | Migration, `POST /auth/guest`, login/registration changes, tests | Not started | ~half a day | [Phase 2](#phase-2-structure) |
| 3. Interior (finishing) | The title screen — logo at scale, animation, enter button | Not started | ~1 day | [Phase 3](#phase-3-interior) |
| 4. Walkthrough (handover) | Two-device check, reduced motion, phone tap targets, docs | Not started | ~half a day | [Phase 4](#phase-4-walkthrough) |

---

## Phase 1: Plan

- [ ] **Q14** — one identity per device, or one shared "house" identity?
      *(Assumption being built on: one per device, plus a handoff link, so
      roadmap box 25's cross-device resume survives.)*
- [ ] **Q15** — how the owner keeps admin access with no visible login screen.
      *(Assumption: `/login` stays, unlinked.)*
- [ ] **Q16** — whether an entry code ships now or with box 13.
      *(Assumption: the hook ships now, unset, so box 13 is not a redesign.)*
- [ ] **Q17** — delete `/signup` and flip `ALLOW_OPEN_REGISTRATION` to default
      `false`? *(May close [Q2](../../QUESTIONS.md#q2--when-does-open-registration-get-turned-off).)*

## Phase 2: Structure

Backend. Nothing here is visible; the app still works through `/login` while it
lands.

- [ ] **Migration `0012_add_user_kind.sql`**
      - `ALTER TABLE users ADD COLUMN kind TEXT NOT NULL DEFAULT 'account'`
      - `ALTER TABLE users ADD COLUMN last_seen_at TEXT`
      - Existing `imran` (id 13, 5 plays, 1 `playback_state` row) is untouched
        and keeps `kind = 'account'`.
      - A sentinel `password_hash` was considered and rejected: `''` is a value
        `bcrypt.compare` will happily be asked about, and "this row cannot log
        in" then lives in whoever remembers to check it. A column says it.
      - Update `.docs/reference/database-schema.md` in the same change.
- [ ] **`db/users.ts`** — `insertGuest()`, `touchLastSeen(id)`, `countGuests()`,
      `pruneIdleGuests(days)`.
      - Guest username: `guest-` + 6 chars of `randomBytes`, so the column's
        `UNIQUE` still means something and the header has something to show.
- [ ] **`POST /auth/guest`** in `routes/auth.ts`
      - Unauthenticated by necessity — it is the entry point.
      - Creates the row, signs the ordinary session JWT (`JWT_EXPIRES_IN`, 7d),
        returns `{ token }`. Same shape as `/auth/login`, so `apiClient` and
        the media-token path need no new branch.
      - **Rate limit / cap.** Unauthenticated row creation in a loop is the one
        new abuse surface this adds. Per-IP cooldown plus a hard ceiling on
        `kind = 'guest'` rows; past the ceiling, prune idle guests first and
        only then refuse.
      - Optional `ENTRY_CODE` check (Q16) — when the env var is unset, the
        endpoint is open; when set, the body must carry the matching code.
- [ ] **`POST /auth/login` refuses `kind = 'guest'`** before it reaches bcrypt.
- [ ] **`GET /auth/me` returns `isGuest`** so the client can render the header
      and hide "sign out" for guests.
- [ ] **Device handoff** (only if Q14 lands on per-device):
      `GET /auth/handoff` returns the caller's own token; the title screen turns
      it into a link + QR, and `/enter#t=<token>` adopts it. This is what keeps
      "pause on the desktop, resume on the phone" true without accounts.
- [ ] **Tests** — guest mint returns a working bearer; a guest token is refused
      by `requireAdmin`; `/auth/login` refuses a guest username; the cap and the
      entry code both behave; an existing account token still works.

## Phase 3: Interior

The title screen. The reference is an arcade attract screen: a logo at
poster scale, a band of information, and one instruction to press. Note that
`TitleScreenPanel`, `WordmarkColumn`, `BrandLockup` and the `--beat` clock in
`index.css` already exist and already animate — this phase is mostly
**recomposition**, not new machinery.

- [ ] **Route `/enter`** replaces `/login` as the unauthenticated destination.
      `RequireAuth` redirects there; `/login` stays reachable by URL only.
- [ ] **Logo at scale.** The lockup goes from `text-3xl` to roughly half the
      viewport — `clamp()` against `vw` *and* `vh` so a phone in landscape
      doesn't push the enter button off the fold.
- [ ] **Logo animation**, all on the existing `--beat` clock so it agrees with
      the mosaic behind it:
      - an entrance (scale-and-settle, once) rather than a permanent loop, so
        the screen calms down instead of demanding attention forever;
      - a sheen sweeping the wordmark every few bars — the `.band-sweep`
        transform-and-mask technique already in `index.css`, retargeted;
      - the mark's dot keeps `animate-brand-pulse` as it is.
- [ ] **The enter button.** "CLICK HERE TO ENTER", blinking on the beat like the
      reference's PRESS START, but a real `<button>`: min 56px tall, generous
      horizontal padding, full-width under `sm`, visible focus ring, and it
      never blinks to fully invisible (a control you cannot see is a control you
      cannot press).
- [ ] **Corner HUD** — the reference's `VER:JA` / `FREE PLAY` corners, done
      honestly: build version, track count and server status from `/health`.
      Cheap, and it makes the screen a status page as well as a door.
- [ ] **Busy and failure states.** Minting takes a round trip: the button goes
      to a disabled "ENTERING…" and an error renders in-place rather than
      bouncing to a dead screen.
- [ ] **`AuthProvider.enterAsGuest()`**; `AppShell` shows "Guest" rather than
      `guest-a83f2c`, and hides the sign-out button for guests — clearing the
      token is how a guest loses their history, so it should not sit in the
      header next to everything else.
- [ ] **Delete `SignupPage` and `/signup`** (Q17), and the
      `registration-status` query with them.
- [ ] **`prefers-reduced-motion`** — the entrance, the sheen and the blink all
      join the existing block in `index.css` that already stills the mosaic.

## Phase 4: Walkthrough

- [ ] Enter on the desktop, enter on the phone, confirm both are real sessions.
- [ ] Handoff link/QR moves one identity to a second device, and the resume
      position follows it (this is roadmap box 25's done-when, re-checked).
- [ ] Favorite a track as a guest, reload the tab, it is still favorited.
- [ ] A guest is refused by `/upload`, `/users` and `/library/scan`.
- [ ] Owner still reaches `/login` and still has admin.
- [ ] Reduced-motion setting: nothing moves, everything still readable.
- [ ] Phone: the button is reachable with a thumb, the logo is not cropped, and
      nothing scrolls sideways. Chrome/Android + desktop only ([A1](../../QUESTIONS.md#a1--is-iossafari-a-target)).
- [ ] `npm test` green, `tsc --noEmit` clean on both halves.
- [ ] `.docs/CHANGELOG.md`, `.docs/FUNCTIONLOG.md`, `.docs/reference/database-schema.md`,
      `.docs/reference/capability-map.md` and the roadmap's box 13 done-when all updated.

---

## Security: the part that actually matters

With no password, **reaching the server is the same thing as being allowed in**.

That is fine today — the server is LAN-only — and it is exactly what roadmap
box 13 ("reach it from outside") currently forbids in its own done-when: *"an
anonymous visitor cannot create an account."* This feature makes anonymous
account creation the *front door*. So box 13's done-when has to be rewritten
rather than quietly failed, and the gate has to move somewhere else:

1. **Network edge** — Tailscale/WireGuard, or a tunnel with its own auth. The
   app never becomes publicly reachable, and the guest door stays open behind
   it. This is the recommendation.
2. **`ENTRY_CODE`** — one shared secret typed once per device, then never again
   because the token persists. Weaker, but it survives a public URL, and it is
   about fifteen lines ([Q16](../../QUESTIONS.md#q16--does-the-entry-code-ship-now-or-with-box-13)).

The two compose. What must not happen is this shipping *and* box 13 shipping
with neither.

Secondary, and smaller: `POST /auth/guest` writes a row for anyone who asks, so
it needs the cap and the cooldown in Phase 2 even on the LAN — a bored friend
with a `for` loop is a plausible way to find out.

---

## Change Log

| Date | Phase affected | What changed | Why | Still fits the Plan phase? |
|---|---|---|---|---|
| — | — | — | — | — |
