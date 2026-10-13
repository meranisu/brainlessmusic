# Account invites and guest upgrade

## Goal

Let a friend get a real account without the admin choosing their password: the admin sends a one-use link, the friend
picks a name and password. The same link, tied to an existing guest, turns that guest into an account and keeps their
history. Decided in A107–A112 ([QUESTIONS.md](../../QUESTIONS.md#answered)); built after room sync (A110).

## Phase Overview

| Phase | What it covers | Status | Checklist |
|---|---|---|---|
| 1. Plan | This doc; the smol case check (A111) | Done 2026-10-12 | [Phase 1](#phase-1-plan) |
| 2. Structure | Migration, invite table, endpoints, case-insensitive names, tests | Done 2026-10-12, not deployed | [Phase 2](#phase-2-structure) |
| 3. Interior (web) | Users page: make and revoke invites; the accept page | Done 2026-10-12, not deployed | [Phase 3](#phase-3-interior-web) |
| 4. Walkthrough | A real invite, a real upgrade, login on Android after | Not started | [Phase 4](#phase-4-walkthrough) |

No Android work in the first version (A109): the friend accepts on the web and then uses Log in on the phone.

---

## Phase 1: Plan

### What exists today (checked 2026-10-11)

- Accounts are made by the admin on the Users page ("Add someone", `UsersPage.tsx`), which posts to
  `POST /auth/register` with a username and password the admin types (`routes/auth.ts`). The friend then has to be
  told that password.
- Guests are `users` rows with `kind = 'guest'` and `password_hash = ''`, username `guest-xxxxxx`, minted by the title
  screen; `/auth/login` refuses them. Guest codes (`db/guestCodes.ts`, A43) are one-use, 7-day keys tied to a guest
  once used (`used_by`).
- `username` is `UNIQUE` and case-sensitive (`database-schema.md`, Discrepancy 3); `findUserByUsername` matches
  exactly; only the Users list sorts with `COLLATE NOCASE`.
- `USERNAME_PATTERN` in `routes/auth.ts` allows 2–32 letters, digits, dot, dash, underscore, so `guest-abc` is
  currently a legal account name.

### Decided

| | Decision | From |
|---|---|---|
| Upgrade | Admin starts it from the Users page; an invite link tied to that guest; the same row becomes `kind='account'`; resume and history kept; the guest's codes revoked; the accepting session stays signed in | A107 |
| Lifetime | One use, expires after 7 days | A108 |
| Android | No invite screen; accept on the web, then Log in | A109 |
| Order | After room sync | A110 |
| Names | Case-insensitive, both unique and login | A111 |
| Prefix | Real account names can't start with `guest-` | A112 |

### Shape (sketch: check against the code before writing it)

- **Table `account_invites`:** `id`, `token` (random, unique, stored hashed like a password reset would be), `created_by`
  (admin user id), `guest_user_id` (nullable: set for an upgrade), `created_at`, `expires_at` (+7 days), `used_at`,
  `used_by`, `revoked_at`.
- **Endpoints:**
  - `POST /admin/invites` `{ guestUserId? }` → `{ url, expiresAt }` (admin). One open invite per guest; a new one
    revokes the old.
  - `GET /admin/invites` (admin): open, used and expired, for the Users page.
  - `DELETE /admin/invites/:id` (admin): revoke.
  - `GET /invites/:token` (public): `{ valid, forGuest: name | null, expiresAt }` or 404, for the accept page.
  - `POST /invites/:token/accept` `{ username, password }` (public, rate-limited): a fresh invite inserts an account;
    an upgrade invite updates the guest row in one transaction (username, password hash, `kind = 'account'`,
    revoke that guest's codes) and bumps nothing that would sign the accepting session out. Returns a token.
- **Case-insensitive names (A111):** a migration replacing the unique index with one on `username COLLATE NOCASE`,
  and `findUserByUsername` matching `COLLATE NOCASE`. Login, register, invite accept and the room/guest code paths
  all go through it. `database-schema.md` updated in the same change; Discrepancy 3 closes.
- **Reserved prefix (A112):** register and accept refuse a name starting with `guest-` (any case).
- **Cloudflare Access:** once Access is on (A74), a friend redeeming on the web must be on the email list first (Q78).

### Before the migration: the smol check (A111)

The unique index can't be made case-insensitive if two accounts already differ only by case. smol isn't this machine,
so the owner runs this there and pastes the result (it reads only):

```bash
docker exec -w /app brainless-app node -e "const db=require('better-sqlite3')('/data/brainlessmusic.db',{readonly:true});console.log(db.prepare('SELECT lower(username) AS name, group_concat(username) AS spellings FROM users GROUP BY lower(username) HAVING count(*) > 1').all())"
```

Read-only (`readonly: true`). The image has no `sqlite3` tool, so it uses the app's own `better-sqlite3` from `/app`
(`Dockerfile`: `WORKDIR /app`, `DB_PATH=/data/brainlessmusic.db`). `[]` means the migration is safe. Any rows get a
question before anything is renamed.

- [x] Owner runs the smol check (2026-10-12: `[]`, no names differ only by case)
- [x] Container path and DB file name confirmed (`Dockerfile`, 2026-10-11)

## Phase 2: Structure

- [x] Migration: `account_invites`; case-insensitive unique index on `username`
- [x] `db/invites.ts` (create, list, revoke, peek, accept) and `findUserByUsername` with `COLLATE NOCASE`
- [x] Endpoints above, with `guestAccess.test.ts` classifying them
- [x] `guest-` prefix refused on register and accept
- [x] Tests: fresh invite, upgrade keeps the user id and plays, expired, used twice, revoked, a name differing only by
      case, `guest-` refused, the accepting session still valid, the guest's codes revoked

## Phase 3: Interior (web)

- [x] Users page: "Invite someone" (copy link), and "Make an account" on each guest row; open invites with Revoke
- [x] `/invite/:token` page, reachable signed out: name and password form, or "this link has expired / was used"
- [x] After accepting: signed in, a note that Log in works on the Android app with the same name and password

## Phase 4: Walkthrough

- [ ] Invite a new friend end to end on smol, then log in on Android
- [ ] Upgrade a guest who has plays and a saved queue; both still there after
- [ ] An old link and a used link both refuse cleanly

## Round 2: sign-up page, email, the app (A187-A192)

- [x] Migration `0037`: `users.email`, unique when set; invites become 8-character codes, old link tokens still match
- [x] Accept requires an email, takes an optional passcode; `PUT /me/email`; sign-in by name or email
- [x] Web `/signup` (type the code) and the invite link both open the same form; "Add your email" prompt; Options section
- [x] Android Sign up screen, `/invite/` links open the app, "Username or email", email prompt
- [ ] Walkthrough: a typed code on the phone, a link opening the app, a guest upgrade in the app, an old account asked
      for its email, email sign-in on both

---

## Change Log

| Date | Phase affected | What changed | Why | Still fits the Plan phase? |
|---|---|---|---|---|
| 2026-10-11 | Plan | Doc written from A107–A112 | Room sync committed, so the parked answers could be recorded | Yes |
| 2026-10-12 | Structure, Interior | Built. Endpoints as sketched, except `POST /admin/invites` returns the raw token and the web builds the URL from its own origin. An upgrade bumps `session_version` and returns a fresh token, so the accepting device stays signed in and the guest's other devices sign out (the plan said bump nothing; that would have left them signed in as the new account). Guest codes are deleted on upgrade, not just revoked, because `deleteGuestCode()` deletes the user | Phase 1's smol check is still open, so nothing is pushed | Yes |
| 2026-10-13 | Round 2 | Sign-up page with typed codes, email and optional passcode, sign-in by email, the Android screen and links (A187-A192). A109's "no Android screen in the first version" is followed by A187 | Owner asked how a friend registers, then for a code-gated sign-up page | Yes |
