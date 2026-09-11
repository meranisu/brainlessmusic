# Setup actions for you

Things Claude can't do (no access to `backend/.env`, no access to your router, no way to restore your files). Written 2026-09-09. Delete this once it's all done.

---

## 1. ~~Restore your music library~~ — done 2026-09-09

Restored to `/home/abcde/music` and scanned: **19 tracks, 1 artist (まぐまぐソフト), 1 album (Piano de Kanon)**, 0 failures. The 20 rows pointing at the vanished `/mnt/wsl/music` were deleted, along with four derived rows they left empty. Search index and artwork verified in sync.

**One track is still missing:** `Love Song from the Water/01. Before I Rise.opus` by `yanaginagi; 麻枝准`. It lived in a subfolder, so it wasn't in the flat copy. Drop it into `/home/abcde/music` (any subfolder is fine — the scanner recurses) and re-scan.

**Still to do: point `LIBRARY_PATH` at the new folder** — see §2. Playback, search and cover art already work, because track paths are stored absolute. But **scanning and uploads** still use `LIBRARY_PATH`, which currently points at the empty tmpfs directory.

To re-scan after adding files, with the server running:

```bash
curl -X POST http://localhost:3000/api/library/scan -H "authorization: Bearer <token>"
```

---

## 2. `backend/.env` — edit these

Claude has no read or write access to this file.

```dotenv
# CHANGE THIS — still points at /mnt/wsl/music, which is RAM and now empty.
# Playback works without it (paths are stored absolute), but scanning and
# uploads do not.
LIBRARY_PATH=/home/abcde/music

# CHANGE IF SHORTER THAN 32 CHARACTERS.
# The server now refuses to boot on a missing, default, or short secret unless
# NODE_ENV is development or test. `npm run dev` still works either way; only
# `npm start` and Docker refuse. Generate one with:
#   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
JWT_SECRET=<64 hex characters>

# OPTIONAL, all have working defaults:
# ARTWORK_PATH=./data/artwork          # cached cover art; safe to delete, a re-scan rebuilds it
# MEDIA_TOKEN_TTL=2h                   # lifetime of the ?token= credentials in <audio>/<img> URLs
# FRONTEND_PATH=                       # leave unset in dev; the container sets it
```

### `backend/.env.example` — add these

Same file access problem. These are documented in the README but missing from the example file:

```dotenv
ARTWORK_PATH=./data/artwork
MEDIA_TOKEN_TTL=2h
FRONTEND_PATH=
```

---

## 3. `/.env` at the repo root — only if you use Docker

Read by `docker-compose.yml`. **Now correctly gitignored** — it wasn't until 2026-09-09, so a secret put here earlier could have been committed.

```dotenv
JWT_SECRET=<64 hex characters, can be the same one>
LIBRARY_DIR=/home/abcde/music
```

---

## 4. Verify the Docker image builds

Claude could not: this sandbox's Docker daemon cannot reach `deb.debian.org` from inside a build layer. Confirmed to be an environment limit, not a Dockerfile problem — a two-line `FROM node:20` + `apt-get install ffmpeg` fails the same way.

```bash
docker compose up --build
```

Then open `http://<host>:3000`. Expect: migrations run, then `Server listening`. If `JWT_SECRET` is missing it will refuse to start and say exactly why — that is the check working.

---

## 5. Check for CGNAT — blocks roadmap step 13

Router admin panel → WAN IP. If it's in `100.64.0.0`–`100.127.255.255` you're behind CGNAT.

- **Behind CGNAT** → Tailscale or Cloudflare Tunnel. Port forwarding cannot work.
- **Not behind CGNAT** → port forward + reverse proxy + TLS is viable, though a mesh VPN is still less to maintain for a few users.

Everything after step 13 in v0.2 waits on this.

---

## 6. Getting in — no longer needs a terminal, or a password

**Rewritten 2026-09-11**, when guest entry replaced the login form. The old
version of this section described `/signup` and how to close it; both are gone.

- **The title screen (`/enter`)** is what anyone lands on. One button, no
  account, no password: pressing it mints a passwordless listener for *that
  device*. Two devices are two listeners, on purpose.
- **Moving to a second device** — sign in on the first, then `This device` in
  the header shows a QR and a link. Open it on the phone and it becomes the same
  listener, so the resume position follows. It replaces whatever that phone was,
  and the dialog says so before it does it.
- **`/users`** (admin nav) still creates accounts, promotes/demotes, resets
  passwords and deletes. Guests show up there labelled as guests.

Your existing `imran` account is untouched and still an admin.

### Getting to the admin sign-in

`/login` is no longer linked from anywhere. Two ways in:

1. **Tap the wordmark on the title screen seven times**, in rhythm — each tap
   within about a second and a half of the last. A numpad appears; the code is
   `ADMIN_ENTRY_CODE` from `backend/.env`.
2. **Type `/login`** in the address bar. Still works, deliberately.

If `ADMIN_ENTRY_CODE` is unset — which it is until you set it — the numpad lets
anything through and `/login` behaves exactly as it always has. Nothing about
admin access has got weaker; it is the same password it was.

### Two settings to make before §5

Open sign-up has already been closed for you: `ALLOW_OPEN_REGISTRATION` now
defaults to `false`, and the page that needed it is deleted. But the exposure
it stood for got **wider**, not narrower — reaching the server is now the same
thing as being allowed to listen. Before roadmap step 13 puts this on the open
internet, both of these want setting in `backend/.env`:

```dotenv
# Anyone pressing "enter" must type this once per device.
ENTRY_CODE=something-you-and-your-friend-know

# Required on top of the password to reach the admin sign-in at all.
ADMIN_ENTRY_CODE=246810
```

Neither is the real gate. The real gate is at the network edge — Tailscale, or
a tunnel with its own auth — and that is what step 13 is for. These two are the
backstop for the day the URL is genuinely public, and the server prints its
entry posture at every boot so you cannot drift into the wrong one.

---

## 7. Push, when you want to

14 commits were merged into `main` on 2026-09-09 (all of v0.1 plus the Docker image), and several more since. Nothing has been pushed — that's deliberately left to you.

```bash
git log --oneline origin/main..main    # see what would go
git push
```
