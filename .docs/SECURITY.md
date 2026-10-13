# Security

The one page for security in brainlessmusic: what's open, where the audits are, and the rules that keep it safe.
Keep it short. Full findings go in a dated audit under `.docs/process/`; this page links to them.

Production is public at `https://music.nobrainmusic.my` (smol, behind a Cloudflare tunnel), the GitHub repo is
public, and a push to `main` that passes CI is live within 5 minutes. Treat every change to `backend/` or
`frontend/` as going straight to the internet.

## Audits

| Date | Scope | Report | Result |
|---|---|---|---|
| 2026-10-13 | Whole codebase at `192f4e0`: sign-in, authorization, files and ffmpeg, web/Android/deploy | [security-audit-2026-10-13.md](process/security-audit-2026-10-13.md) | No Critical; 1 High, 8 Medium, 15 Low (S1-S24) |

Earlier reviews that touched security: [codebase-review-2026-10-11.md](process/codebase-review-2026-10-11.md),
[review-guest-accounts-2026-10-11.md](process/review-guest-accounts-2026-10-11.md).

## Open findings

Most severe first. Details, file references and fixes are in the audit. When one is fixed, mark it here and in the
audit's Status column with the commit, and add a CHANGELOG entry as usual.

| ID | Severity | Finding | Status |
|---|---|---|---|
| S1 | High | Passcode sign-in can be brute-forced with parallel requests (the limit counts after bcrypt) | open |
| S2 | Medium | Per-account sign-in limit is case-sensitive, so `Imran` and `imran` get separate budgets | open |
| S3 | Medium | A 4-digit passcode is guessable in about 10 days, and failures lock out password sign-in | open, Q175 |
| S4 | Medium | A passcode survives a password reset; setting one needs no current password | open |
| S5 | Medium | `backend/.env.example` reportedly holds a real-looking `JWT_SECRET` the boot check accepts | open, unverified |
| S6 | Medium | Cover thumbnails run unbounded ffmpeg (guest can overload smol) | open |
| S7 | Medium | Picture uploads have no rate limit or concurrency cap | fixed 2026-10-13: 10 per account per 10 min, 2 at once |
| S8 | Medium | Room WebSocket has no command rate limit | open |
| S9 | Medium | Android release action pinned by tag next to the signing key | open |
| S10 | Low | Hidden songs leak through `/shuffle` (guests too), cover, waveform, `/prepare` | open |
| S11 | Low | Song play history shows login names, against A174 | open |
| S12 | Low | `main` unprotected; auto-deploy CI lookup unfiltered | open, Q176 |
| S13 | Low | Port 3000 reachable directly; `cf-connecting-ip` trusted from anyone | open |
| S14 | Low | `docker-compose.yml` defaults open registration to `true` | open |
| S15 | Low | Error messages (paths, SQL, ffmpeg stderr) reach clients | open |
| S16 | Low | No CSP or security headers; tokens in `localStorage` | open |
| S17 | Low | Invite tokens appear in logs | open |
| S18 | Low | Usernames confirmable by sign-in timing | open |
| S19 | Low | No "sign out everywhere" | open |
| S20 | Low | Anyone can take an account's display name | open, Q177 |
| S21 | Low | Playlist names not type- or length-checked | fixed 2026-10-13: text, no control characters, 100 characters max |
| S22 | Low | Audio ffmpeg calls lack `-protocol_whitelist file` (admin-added files only) | open |
| S23 | Low | Three filesystem writers read their root from config | open |
| S24 | Low | Smaller items: cache key, `.partial` sweep, admin PATCH order, workflow input, handoff link | open |

## Owner decisions waiting

Asked in [QUESTIONS.md](QUESTIONS.md); answer there, not here.

- **Q175:** how strong a passcode must be (S3).
- **Q176:** protect `main` on GitHub (S12).
- **Q177:** whether someone can take an account's display name (S20).

## Rules for anyone changing the code

These come from past incidents and decisions. Each is enforced in code review, some by hooks.

1. **Never read or print secrets.** No `backend/.env`, root `.env` or `.env.example` reads (denied in
   `.claude/settings.json`), no secret values in logs, commits or chat.
2. **Every route has an explicit guard.** `authenticate` for anyone signed in, `requireAccount` for anything a
   guest must not do (A37), `requireAdmin` for admin. Anything acting on an object checks the caller owns it.
3. **Hidden songs stay hidden from non-admins (A34).** Filter `t.hidden = 0` in the SQL, not after paging, so totals
   and pages agree. This includes covers, waveforms, shuffle and other people's profiles.
4. **Others see display names, never login names or admin status (A174).** Only your own profile carries them.
5. **ffmpeg on anything a user uploaded** pins the input format from the file's first bytes and passes
   `-protocol_whitelist file`, a pixel cap and a timeout. `services/avatars.ts` is the pattern.
6. **Sign-in limits count an attempt before the slow check**, not after, and key on the lower-cased name (S1, S2,
   once fixed).
7. **Filesystem writers take their root as a parameter** and never delete outside what they were given (hard rule in
   `CLAUDE.md`, from the 2026-09-09 library loss).
8. **Errors to clients are generic;** detail goes to the server log.

## Checked and fine (2026-10-13)

JWT secret policy and token scopes, revocation on delete/demote/password reset, invites and guest codes, uploads and
filing, streaming and Range handling, no XSS sinks or open redirects, CORS off, WebSocket auth by first message,
Android token storage and updater, CI permissions, container runs as non-root. Details in the audit's last section.
