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
  reachable by whoever clicked "enter" ([A14](../../QUESTIONS.md#a14--the-admin-login-stays-unadvertised)).

## Phase Overview

| Phase | What it covers | Status | Est. Duration | Checklist |
|---|---|---|---|---|
| 1. Plan (blueprint) | Identity model, admin path, entry-gate policy | **Done 2026-09-11** | — | [Phase 1](#phase-1-plan) |
| 2. Structure (foundation) | Migration, `POST /auth/guest`, login/registration changes, tests | **Done 2026-09-11** | ~half a day | [Phase 2](#phase-2-structure) |
| 3. Interior (finishing) | The title screen — logo at scale, animation, enter button | **Done 2026-09-11** | ~1 day | [Phase 3](#phase-3-interior) |
| 4. Walkthrough (handover) | Two-device check, reduced motion, phone tap targets, docs | **Done 2026-09-11** — 42/42 in headless Chromium | ~half a day | [Phase 4](#phase-4-walkthrough) |

---

## Phase 1: Plan

All four decided by the owner on 2026-09-11. Full reasoning lives in the
ledger; this is the summary the rest of the phases are built on.

- [x] **[A13](../../QUESTIONS.md#a13--one-guest-identity-per-device-not-a-shared-house-account) — one identity per device.**
      Each browser mints its own `users` row and its own token. Nobody shares a
      queue, a favorites list or a resume position with anybody else.
      **Consequence, accepted:** the phone is a different listener from the
      desktop, so box 25's cross-device resume needs the handoff link below to
      stay true.
- [x] **[A14](../../QUESTIONS.md#a14--the-admin-login-stays-unadvertised) — `/login` stays, unadvertised, behind a numpad.**
      Tap the logo repeatedly, a numpad appears, and the code goes to the
      **server** — `POST /auth/unlock` mints a short-lived `scope: 'unlock'`
      ticket, and `POST /auth/login` refuses without it whenever
      `ADMIN_ENTRY_CODE` is set. Hiding the route is tidiness; refusing the
      endpoint is the control.
- [x] **[A15](../../QUESTIONS.md#a15--the-entry-code-hook-ships-now-unset) — `ENTRY_CODE` ships now, unset.**
      Inert on the LAN; a config change away from being live when box 13 exposes
      the server. Box 13's done-when has been rewritten to name the real gate.
- [x] **[A16](../../QUESTIONS.md#a16--signup-goes-and-open-registration-closes) — `/signup` is deleted, `ALLOW_OPEN_REGISTRATION` defaults `false`.**
      Registration goes back to admin-only, bootstrap-when-empty still applies.

## Phase 2: Structure

Backend. Nothing here is visible; the app still works through `/login` while it
lands.

- [x] **Migration `0012_add_user_kind.sql`**
      - `ALTER TABLE users ADD COLUMN kind TEXT NOT NULL DEFAULT 'account'`
      - `ALTER TABLE users ADD COLUMN last_seen_at TEXT`
      - Existing `imran` (id 13, 5 plays, 1 `playback_state` row) is untouched
        and keeps `kind = 'account'`.
      - A sentinel `password_hash` was considered and rejected: `''` is a value
        `bcrypt.compare` will happily be asked about, and "this row cannot log
        in" then lives in whoever remembers to check it. A column says it.
      - Update `.docs/reference/database-schema.md` in the same change.
- [x] **`db/users.ts`** — `insertGuest()`, `touchLastSeen(id)`, `countGuests()`,
      `pruneIdleGuests(days)`.
      - Guest username: `guest-` + 6 chars of `randomBytes`, so the column's
        `UNIQUE` still means something and the header has something to show.
- [x] **`POST /auth/guest`** in `routes/auth.ts`
      - Unauthenticated by necessity — it is the entry point.
      - Creates the row, signs the ordinary session JWT (`JWT_EXPIRES_IN`, 7d),
        returns `{ token }`. Same shape as `/auth/login`, so `apiClient` and
        the media-token path need no new branch.
      - **Rate limit / cap.** Unauthenticated row creation in a loop is the one
        new abuse surface this adds. Per-IP cooldown plus a hard ceiling on
        `kind = 'guest'` rows; past the ceiling, prune idle guests first and
        only then refuse.
      - `ENTRY_CODE` check ([A15](../../QUESTIONS.md#a15--the-entry-code-hook-ships-now-unset)) —
        unset, and the endpoint is open; set, and the body must carry the
        matching code. Compared with `timingSafeEqual`, and a wrong code costs
        the same cooldown a mint does.
- [x] **`POST /auth/login` refuses `kind = 'guest'`** before it reaches bcrypt.
- [x] **`ADMIN_ENTRY_CODE` + `POST /auth/unlock`** ([A14](../../QUESTIONS.md#a14--the-admin-login-stays-unadvertised))
      - Takes `{ code }`, compares with `timingSafeEqual`, returns a JWT with
        `scope: 'unlock'` and a ~5 minute expiry. Nothing identifies a user —
        it says only "this browser typed the code", which is all it should say.
      - `signUnlockTicket` / `verifyUnlockTicket` join `services/token.ts`. The
        module's existing rules already cover the new scope without edits:
        `verifySessionToken` rejects *any* scoped token and `verifyMediaToken`
        demands `media`, so a ticket can neither call the API nor stream a file.
      - **`POST /auth/login` requires the ticket** while the code is set — a
        header, not a body field, so it composes with the existing credentials
        shape. Unset, login behaves exactly as it does today.
      - Shares the guest cooldown bucket, plus its own attempt counter: a
        numeric code is small enough to enumerate if nothing is counting.
      - Wrong code and no code give the same `401`. The endpoint never says
        whether a code is *configured*, or the numpad becomes a detector for
        whether this server has an admin door at all.
- [x] **`GET /auth/me` returns `isGuest`** so the client can render the header
      and hide "sign out" for guests.
- [x] **Device handoff** — required, now that [A13](../../QUESTIONS.md#a13--one-guest-identity-per-device-not-a-shared-house-account)
      has made every device its own listener. `GET /auth/handoff` returns the
      caller's own token; the title screen turns it into a link + QR, and
      `/enter#t=<token>` adopts it. This is the only thing keeping "pause on the
      desktop, resume on the phone" true without reintroducing accounts.
      Adoption is a *replacement*: the phone's own guest row is abandoned, not
      merged, so anything it favorited before the handoff is lost — which is why
      the screen should say so before it swaps.
- [x] **Tests** — guest mint returns a working bearer; a guest token is refused
      by `requireAdmin`; `/auth/login` refuses a guest username; the cap and the
      entry code both behave; an existing account token still works.

## Phase 3: Interior

The title screen. The reference is an arcade attract screen: a logo at
poster scale, a band of information, and one instruction to press. Note that
`TitleScreenPanel`, `WordmarkColumn`, `BrandLockup` and the `--beat` clock in
`index.css` already exist and already animate — this phase is mostly
**recomposition**, not new machinery.

- [x] **Route `/enter`** replaces `/login` as the unauthenticated destination.
      `RequireAuth` redirects there; `/login` stays reachable by URL only.
- [x] **Logo at scale.** The lockup goes from `text-3xl` to roughly half the
      viewport — `clamp()` against `vw` *and* `vh` so a phone in landscape
      doesn't push the enter button off the fold.
- [x] **Logo animation**, all on the existing `--beat` clock so it agrees with
      the mosaic behind it:
      - an entrance (scale-and-settle, once) rather than a permanent loop, so
        the screen calms down instead of demanding attention forever;
      - a sheen sweeping the wordmark every few bars — the `.band-sweep`
        transform-and-mask technique already in `index.css`, retargeted;
      - the mark's dot keeps `animate-brand-pulse` as it is.
- [x] **The enter button.** "CLICK HERE TO ENTER", blinking on the beat like the
      reference's PRESS START, but a real `<button>`: min 56px tall, generous
      horizontal padding, full-width under `sm`, visible focus ring, and it
      never blinks to fully invisible (a control you cannot see is a control you
      cannot press).
- [x] **Corner HUD** — the reference's `VER:JA` / `FREE PLAY` corners, done
      honestly: build version, track count and server status from `/health`.
      Cheap, and it makes the screen a status page as well as a door.
- [x] **Busy and failure states.** Minting takes a round trip: the button goes
      to a disabled "ENTERING…" and an error renders in-place rather than
      bouncing to a dead screen.
- [x] **`AuthProvider.enterAsGuest()`**; `AppShell` shows "Guest" rather than
      `guest-a83f2c`, and hides the sign-out button for guests — clearing the
      token is how a guest loses their history, so it should not sit in the
      header next to everything else.
- [x] **Delete `SignupPage` and `/signup`** ([A16](../../QUESTIONS.md#a16--signup-goes-and-open-registration-closes)),
      and the `registration-status` query with them.
- [x] **The hidden admin entrance** ([A14](../../QUESTIONS.md#a14--the-admin-login-stays-unadvertised))
      — seven taps on the logo, each within ~1.5 s of the last, opens a numpad.
      No visible affordance and no hint in the DOM; the counter resets on the
      gap, so an idle child mashing the logo never trips it.
      - The numpad is a real keypad — big round targets, a delete key, no
        on-screen keyboard — since this is the one control on the screen that
        has to work with a thumb and with a mouse alike.
      - It posts to `/auth/unlock` and only then routes to `/login`, so the code
        is never in the bundle and a wrong entry costs a round trip. After a few
        failures it stops accepting for a minute and says so.
      - The ticket lives in `sessionStorage`, not `localStorage`: closing the
        tab should close the door.
      - `/login` without a ticket redirects to `/enter` — cosmetic, and
        documented as cosmetic. The endpoint is what refuses.
- [x] **Handoff UI** — "continue on another device" shows the QR and the link;
      `/enter#t=…` adopts a token, warns that it replaces this device's own
      listening history, and strips the fragment from the URL bar afterwards so
      a screenshot of the address bar isn't a working credential.
- [x] **`prefers-reduced-motion`** — the entrance, the sheen and the blink all
      join the existing block in `index.css` that already stills the mosaic.

## Phase 4: Walkthrough

- [x] Enter on the desktop, enter on the phone, confirm both are real sessions.
- [x] Handoff link/QR moves one identity to a second device, and the resume
      position follows it (this is roadmap box 25's done-when, re-checked).
- [x] Favorite a track as a guest, reload the tab, it is still favorited.
- [x] A guest is refused by `/upload`, `/users` and `/library/scan`.
- [x] Owner still reaches `/login` via the taps + numpad, and still has admin.
- [x] `/login` typed directly, with no ticket, lands back on the title screen.
- [x] `curl POST /auth/login` with the **correct** username and password but no
      unlock ticket is refused — this is the check that says the mechanism is
      real rather than decorative.
- [x] Wrong codes lock the numpad out after a few tries; `ADMIN_ENTRY_CODE`
      unset restores today's behaviour exactly.
- [x] Reduced-motion setting: nothing moves, everything still readable.
- [x] Phone: the button is reachable with a thumb, the logo is not cropped, and
      nothing scrolls sideways. Chrome/Android + desktop only ([A1](../../QUESTIONS.md#a1--is-iossafari-a-target)).
- [x] `npm test` green, `tsc --noEmit` clean on both halves.
- [x] `.docs/CHANGELOG.md`, `.docs/FUNCTIONLOG.md`, `.docs/reference/database-schema.md`,
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
   it. **Decided: this is box 13's job**, and box 13's done-when now says so.
2. **`ENTRY_CODE`** — one shared secret typed once per device, then never again
   because the token persists. Weaker, but it survives a public URL.
   **Decided: the hook ships here, unset** ([A15](../../QUESTIONS.md#a15--the-entry-code-hook-ships-now-unset)).

The two compose. What must not happen is this shipping *and* box 13 shipping
with neither. The owner's standing context for accepting the open door: only
people who have been let onto the network can reach this server at all.

Secondary, and smaller: `POST /auth/guest` writes a row for anyone who asks, so
it needs the cap and the cooldown in Phase 2 even on the LAN — a bored friend
with a `for` loop is a plausible way to find out.

---

## Change Log

| Date | Phase affected | What changed | Why | Still fits the Plan phase? |
|---|---|---|---|---|
| 2026-09-11 | Plan | Q14–Q17 answered; Phase 1 closed | Owner decided all four in one turn — per-device identity, hidden `/login`, `ENTRY_CODE` unset, `/signup` deleted | Yes — this *is* the Plan phase completing |
| 2026-09-11 | Structure, Interior | Device handoff moved from conditional to required | [A13](../../QUESTIONS.md#a13--one-guest-identity-per-device-not-a-shared-house-account) chose per-device, which is the branch that costs box 25 its cross-device resume unless handoff exists | Yes |
| 2026-09-11 | Interior | Added the hidden admin entrance (gesture → `/login`) | [A14](../../QUESTIONS.md#a14--the-admin-login-stays-unadvertised) asked for the login page to be hidden rather than merely unlinked | Yes |
| 2026-09-11 | Structure, Interior | The gesture became taps-then-numpad, and the code moved **server-side** (`ADMIN_ENTRY_CODE`, `POST /auth/unlock`, a ticket `/auth/login` then requires) | Owner asked for a numpad, and asked how to stop someone simply typing `/login`. A client-side check cannot answer that — the route table and the code would both be in the bundle, and the endpoint is reachable by `curl` regardless of what the UI draws | Yes — Phase 1 fixed *that* the login stays hidden, not *how* |
| 2026-09-11 | Structure | Phase 2 landed: migration `0012`, `POST /auth/guest`, `POST /auth/unlock`, the login ticket requirement, rate limiting, the guest cap and prune. 280 backend tests pass (23 new); the whole flow re-verified over real HTTP on :3099 | — | Yes |
| 2026-09-11 | Structure | Added `countAccounts()`, not planned | Found while writing the bootstrap test: `countUsers()` decides whether a fresh server is still claimable, and a guest minted by the first visitor would have slammed that window shut with no way back but the CLI | Yes — a correction inside the phase, not a scope change |
| 2026-09-11 | — | `backend/.env.example` left un-updated | The file is not writable from this environment. The seven new variables are documented in `README.md` and must be copied across by hand | Yes |
| 2026-09-11 | Interior, Structure | `/auth/unlock` reversed: it now hands out a ticket freely when `ADMIN_ENTRY_CODE` is unset, where Phase 2 refused identically in both cases | The Phase 2 rule locked the owner out of the door the UI had just hidden — with no code set, nothing could satisfy the numpad, and the numpad was the only route to `/login`. A ticket grants nothing in that configuration, since login does not ask for one. Costs one bit a login attempt reveals anyway | Yes — the property Phase 1 wanted was "hiding is not the protection", and that still holds |
| 2026-09-11 | Structure | `GET /auth/handoff` **not built** | The client already holds the token it would have returned; the endpoint had nothing to do | Yes — the handoff itself shipped, which is what the phase promised |
| 2026-09-11 | Interior | Enter-button blink changed from opacity to a colour pulse | Fading the button fades its label: white on orange at 0.62 opacity drops the label below readable contrast twice a second. Swapping orange-600/orange-500 keeps it legible on every frame | Yes |
| 2026-09-11 | Interior | Band gradient made responsive, and the title `vw` ceiling lowered 13 → 11.5 | Found in a screenshot, not a test: on a 390px phone the wordmark ran to 11px of the right edge with the mosaic showing through behind it. The bounding-box assertion had passed on the broken version | Yes |
| 2026-09-11 | — | Frontend gained `qrcode`; `package.json` version set to `0.1.0` and exposed as `__APP_VERSION__` | The handoff needs a QR a phone camera can read, and the HUD's version readout should come from a file rather than a literal in JSX | Yes |
| 2026-09-11 | — | Box 13's done-when rewritten in the roadmap | It read "an anonymous visitor cannot create an account", which this feature deliberately contradicts; it now names the gate instead | Yes — decided under [A15](../../QUESTIONS.md#a15--the-entry-code-hook-ships-now-unset) |
