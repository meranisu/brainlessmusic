# Running brainlessmusic with Docker

This walks through getting the app running on your own machine with Docker —
no need to install Node, ffmpeg, or anything else by hand. One container runs
both the API and the web app.

## What you need first

1. **Docker Desktop** — [docker.com/products/docker-desktop](https://www.docker.com/products/docker-desktop).
   Install it, open it, and leave it running in the background (it needs to
   stay running while you use the app). On Windows this needs WSL2, which the
   installer sets up for you if you don't already have it.
2. **Git**, to download the project. If you can already run `git --version`
   in a terminal, you have it.
3. A terminal. On Windows, use WSL2's Ubuntu terminal (not PowerShell/cmd) if
   Docker Desktop is using the WSL2 backend, which is the default.

## 1. Get the code

```bash
git clone <repo-url>
cd brainlessmusic
```

## 2. Create your config file

The app needs a secret key to sign login tokens, and it flatly refuses to
start without a real one — that's intentional, not a bug you need to work
around.

```bash
echo "JWT_SECRET=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")" > .env
```

No Node installed to run that? Any 64-character random hex string works —
generate one at [random.org](https://www.random.org/strings/) or just mash
the keyboard for 64 hex-looking characters and put it in a file named `.env`
in the project folder as:

```
JWT_SECRET=<your random string here>
```

Optional: if you already have a music folder you want the app to use instead
of the empty default, add a second line:

```
LIBRARY_DIR=/path/to/your/music
```

## 3. Build it

```bash
docker compose build
```

This downloads a base Linux image, installs ffmpeg (needed for streaming),
and builds both the web app and the server inside it. **It's slow the first
time** — several minutes, mostly spent unpacking ffmpeg's dependencies — and
that's normal. Only the first build is slow; later ones reuse most of the
work.

## 4. Run it

```bash
docker compose up -d
```

Then open **http://localhost:3000** in a browser. First account you register
becomes the admin.

Check it actually started:

```bash
docker compose ps       # should say "healthy" after ~10 seconds
docker compose logs -f  # if it doesn't, this shows why
```

## Letting another device on your network use it (the client/host setup)

If one machine runs the container (the **host**) and another device — a
laptop, phone, whatever — just wants to open it in a browser (the
**client**), you don't run Docker on the client at all. Only the host needs
steps 1–4 above.

On the **host**, find its local network IP:

- Windows: `ipconfig`, look for "IPv4 Address" under your active adapter
  (Wi-Fi or Ethernet).
- Mac/Linux: `ip addr` or `ifconfig`.

It'll look like `192.168.x.x` or `10.x.x.x`.

On the **client**, open `http://<that-ip>:3000` in a browser — e.g.
`http://192.168.1.42:3000`. Both devices need to be on the same network
(same Wi-Fi) for this to work.

If it doesn't load: check the host's firewall isn't blocking port 3000, and
that Docker Desktop is actually running on the host (not just installed).

## Adding a second music folder (a separate drive, say)

The app can scan more than one folder — from Options → Library folders,
once signed in as admin, with a **Browse…** button that walks the
container's own filesystem so you don't have to already know the exact
path. But it can only see what's actually mounted into the container in the
first place.

`docker-compose.yml` already mounts every Windows drive, read-only:
```yaml
- /mnt:/mnt:ro
```
WSL2 exposes all of them under `/mnt` (`/mnt/c`, `/mnt/d`, and so on)
whether or not Docker is involved, so this one line covers every drive at
once — current ones and any plugged in later. In Options → Library folders,
click Browse, navigate to the folder you want (e.g. `/mnt/d/old-music`), and
add it. No `docker-compose.yml` edit or restart needed per folder.

If you'd rather expose one specific drive than all of `/mnt`, swap that line
for a narrower one instead:
```yaml
- /mnt/d/old-music:/library-2
```
— in which case a restart (`docker compose up -d`) is needed for that one
mount to take effect, same as any new bind mount. This is the one thing this
app can't do from its own UI — a container can't mount a drive into itself
at runtime.

## Stopping it

```bash
docker compose down       # stops it, keeps your data (library, playlists, etc.)
docker compose down -v    # also wipes the database — only do this on purpose
```

## After pulling new code

```bash
git pull
docker compose up -d --build
```

