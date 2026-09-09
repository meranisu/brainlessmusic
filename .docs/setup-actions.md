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

## 6. Accounts — no longer needs a terminal

- **`/signup`** — self-serve sign-up, **open by default** as of 2026-09-09. Anyone who can reach the server can create a listener account. Linked from the login page.
- **`/users`** (admin nav) creates accounts, promotes/demotes, resets passwords and deletes.

Your existing `imran` account is already an admin.

### Close registration before §5

Open sign-up is fine while this is LAN-only. The moment the server is reachable from outside — which is exactly what roadmap step 13 does — anyone who finds the login page can help themselves to an account. Add this to `backend/.env` before then:

```dotenv
ALLOW_OPEN_REGISTRATION=false
```

The backend prints a warning at every boot while it's on, so you won't lose track of it. Self-serve accounts are never admins, and `/library/scan` moved behind an admin check for the same reason — but a stranger with a listener account can still stream your whole library.

---

## 7. Push, when you want to

14 commits were merged into `main` on 2026-09-09 (all of v0.1 plus the Docker image), and several more since. Nothing has been pushed — that's deliberately left to you.

```bash
git log --oneline origin/main..main    # see what would go
git push
```
