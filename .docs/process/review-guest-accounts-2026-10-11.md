# Review of guest accounts (A67-A70)

Reviewed: `ab544c0` (backend and web), `98b110c` (Android) and `4332b58` (hover-row fix), on 2026-10-11. The six
commits before these have their own review, [session-review-2026-10-11.md](session-review-2026-10-11.md) (R1-R5);
these findings are numbered G so the two lists don't clash. Line numbers are from `main` at `c7e0152`. Tick each box
when it is fixed, and name the commit that fixed it.

Results at review time:
- Backend `tsc --noEmit` clean; `npm test` 412 of 412.
- Frontend `npm run build` clean; lint adds nothing new.
- Android not built locally; GitHub's CI built both commits (debug build on `98b110c`, release v0.3.11 on `c7e0152`).
- Production has this backend: `PUT /api/me/name` with no login answers 401, not 404.
- Checked and fine: revoking a used code clears every table that points at the guest (no foreign-key error); wrong,
  expired and revoked codes all answer the same 401; the request secret is stored only as a hash; names are cleaned
  and capped at 32; revoking a used code asks for confirmation first. `4332b58` is fine.

## Fix

- [x] **G1. An approved request can be lost, leaving a guest nobody can sign in as.** Fixed in ca945ba. Medium.
      - An approved request is handed over once: the first collect marks it `collected`, and every later collect
        answers 404 (`backend/src/db/guestCodeRequests.ts:127`, `:143`).
      - If that one answer never reaches the device, the guest exists but the device shows "gone" and asks again.
        Ways it happens: signal drops at that moment; the app is closed mid-poll; on Android, Stop waiting cancels
        the poll coroutine while the request is already on the server (`AuthRepository.kt:130`, `:155`); on the web,
        polls overlap, because `setInterval` fires every 3 s without waiting for the last poll
        (`frontend/src/pages/AccountSelectPage.tsx:238`), and the 404 for the second can arrive first.
      - Recovery today: the admin copies the code from the Guest access card and sends it. Nothing tells either side
        to do that.
      - Fix: (a) server: let a `collected` request answer `approved` again (same token and code) to the right secret
        for a short window, e.g. 10 minutes after the first collect; needs a `collected_at` column or reuse of an
        existing timestamp. (b) web: skip a poll while one is in flight (a ref flag, or `setTimeout` chained after each
        poll instead of `setInterval`). (c) optional: when a request ends up `gone`, say "If the admin already
        approved you, ask them for your code." Add a test for a repeat collect inside and outside the window.

## Smaller

- [ ] **G2. Codes used under the old one-use rule are now permanent keys.** Low. Since A69 a used code signs anyone
      holding it in as its guest, on any device, until revoked (`backend/src/db/guestCodes.ts:82`). That is the
      decision, but QR cards printed when codes were one-use (v0.2.0 era) now work for whoever finds them. Not a code
      change: revoke codes on cards that are lying around, or mention it in the Guest access card's help text.
- [ ] **G3. The request queue can be filled by strangers.** Low. 20 may wait at once, 5 per address per hour
      (`backend/src/routes/auth.ts:184`), so a few addresses can fill it and real requests are refused for up to
      24 hours. Cloudflare Access (A74) in front of the site closes it; otherwise consider a lower per-address limit
      or a per-day one. Left as is: A74 (Cloudflare Access) closes it once switched on.
- [x] **G4. A guest can show up under an account's name in the codes list.** Fixed in 6ded2eb. Low. The used-codes list shows only the
      display name (`frontend/src/components/GuestCodesPanel.tsx:240`, `c.usedByName ?? c.usedBy`), so a guest who
      calls itself "imran" reads as "imran". Fix: show the internal `guest-xxxxxx` name small next to it. Shared names
      between guests are allowed (A68); this is only about telling guests from accounts.
