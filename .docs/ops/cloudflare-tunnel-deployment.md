# Deploying on the Arch Linux box, reachable via nobrainmusic.my

This walks through running brainlessmusic on a dedicated Linux machine (a
friend's Arch Linux gaming PC, staying on 24/7) and making it reachable from
anywhere at `<subdomain>.nobrainmusic.my`, without opening any ports on the
router. Two pieces: the app itself (Docker Compose, same as local dev — see
`.docs/ops/docker-local-build.md`), and a **Cloudflare Tunnel** that connects
it to the internet.

**Why a tunnel instead of port-forwarding:** most home/mobile ISPs put you
behind CGNAT (no public IP to forward a port to at all), and even when they
don't, port-forwarding means exposing a raw port and chasing IP changes with
dynamic DNS. A Cloudflare Tunnel makes an **outbound-only** connection from
the box to Cloudflare's edge, which then proxies the domain to it. No open
ports, works through CGNAT, free TLS. See `.docs/QUESTIONS.md` (A20, A21) for
the decision record.

**Why a Cloudflare Access gate on top:** this app's own auth (JWT + guest
entry) is designed for "reachable on the LAN." Once it's reachable by anyone
on the internet, 24/7, indefinitely, Access adds a second, free login gate in
front of it — a bug in the app, a misconfigured `.env`, or a weak secret
never gets a chance to matter, because the request never reaches the
container without passing Cloudflare's login first.

## What you need first

1. **Arch Linux**, already installed, network-connected, set to stay on.
2. **Domain on Cloudflare** — already done: `nobrainmusic.my`'s nameservers
   point at Cloudflare (`norman.ns.cloudflare.com` / `zita.ns.cloudflare.com`),
   confirmed Active on the free plan.
3. Access to the Cloudflare account those nameservers belong to
   (`needlemouse21@gmail.com`).
4. A terminal on the Arch box (SSH in, or sit at it directly).

## 1. Install Docker

```bash
sudo pacman -S docker docker-compose
sudo systemctl enable --now docker
sudo usermod -aG docker $USER   # log out/in (or `newgrp docker`) for this to take effect
```

## 2. Get the app and the library onto the box

```bash
git clone <repo-url>
cd brainlessmusic
```

Copy the music library onto the box's own storage (decided: local copy for
speed, not a network mount). Note the path — you'll point `LIBRARY_DIR` at
it below.

**The WSL2-specific mount in `docker-compose.yml` doesn't apply here.** Local
dev's `- /mnt:/mnt:ro` line exists because WSL2 exposes Windows drives under
`/mnt` automatically; Arch has no equivalent. Leave that line out (or delete
it) on this box — there's nothing for it to mount.

## 3. Create `.env`

```bash
cat > .env <<'EOF'
JWT_SECRET=<generate with the node one-liner below>
ALLOW_OPEN_REGISTRATION=false
EOF
```

Generate the secret:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

**`ALLOW_OPEN_REGISTRATION` must be `false` here.** The compose file's
default (`true`) is fine on a LAN; this box is about to be reachable from
the open internet, where "anyone who can reach it can create an account"
stops meaning "anyone in the house."

Add the library path too:
```
LIBRARY_DIR=/path/to/music/on/this/box
```

## 4. Bring the app up

```bash
docker compose build
docker compose up -d
docker compose ps   # should say "healthy" after ~10s
```

Confirm it works locally on the box first: `curl http://localhost:3000` (or
a browser if there's a desktop environment) before touching Cloudflare at
all — isolates "is the app broken" from "is the tunnel broken" if something
doesn't work later.

## 5. Create the Cloudflare Tunnel

In the Cloudflare dashboard (`dash.cloudflare.com`), find **Zero Trust** in
the sidebar (first visit asks for a team name — any name, free plan, no
cost). Then:

1. **Networks → Tunnels → Create a tunnel** → Cloudflared → name it
   (e.g. `brainlessmusic`).
2. **Install and run a connector** → OS dropdown → **Docker** (there's no
   Arch-specific option; Docker is the right pick since the app is already
   containerized). Copy the token from the command it shows you — it's the
   part after `--token`.
3. **Do not paste that token anywhere public** (chat, screenshots, commit
   history). It's a live credential that lets anyone run a connector for
   this tunnel. Put it straight into `.env`:
   ```
   CLOUDFLARE_TUNNEL_TOKEN=<paste here>
   ```
   `.env` is already gitignored (`.gitignore` has `.env` / `.env.*`), same
   pattern as `JWT_SECRET`.

## 6. Add cloudflared to `docker-compose.yml`

Run `cloudflared` as a container in the same stack, rather than the one-off
`docker run` the dashboard suggests — same restart/reboot handling as the
app itself:

```yaml
  cloudflared:
    image: cloudflare/cloudflared:latest
    container_name: brainless-cloudflared
    restart: unless-stopped
    command: tunnel --no-autoupdate run --token ${CLOUDFLARE_TUNNEL_TOKEN}
    depends_on:
      - brainless-app
```

```bash
docker compose up -d
```

## 7. Route the tunnel (Public Hostname)

Back in the tunnel's config in the Zero Trust dashboard, **Route tunnel** /
add a **Public Hostname**:

- **Subdomain**: your pick, e.g. `music.nobrainmusic.my`
- **Type**: `HTTP` — not `HTTPS`. The app serves plain HTTP on port 3000
  internally; Cloudflare's edge is what terminates TLS for visitors, so the
  tunnel-to-origin hop doesn't need it.
- **URL**: `brainless-app:3000` — **no scheme prefix** (Type already picks
  it; typing `http://` here too causes a "service URL is not valid" error),
  and the **container name**, not `localhost`. Once `cloudflared` is a
  container on the same Compose network, `localhost` means "inside the
  cloudflared container," not the app — Docker Compose resolves service/
  container names to the right container automatically.

**Complete setup.**

## 8. Add the Access gate

**Access controls → Applications** (naming may vary slightly by dashboard
version) → **Add an application → Self-hosted**:

- Same hostname as step 7.
- Policy: allow specific emails (yours, and your friend's if they need
  access too) — free for up to 50 users on Cloudflare's plan.

Once this is live, visiting the hostname prompts an email/OTP login before
the request ever reaches the app.

## 9. Verify end-to-end

Visit `https://<your-subdomain>.nobrainmusic.my` from a device **not** on
the same network as the Arch box (phone on mobile data is the real test).
Expect: Cloudflare Access login first, then the app's own guest-entry/login
screen.

## 10. Reboot resilience

- `restart: unless-stopped` on both `brainless-app` and `cloudflared` means
  Docker restarts them automatically after the box reboots, as long as the
  Docker daemon itself comes up — confirmed by step 1's
  `systemctl enable docker`.
- A power outage takes the whole box down; per the owner's call, that's
  accepted — restart it manually when power's back, no auto-recovery
  attempted beyond what's above.

## If something needs re-checking later

- **Token compromised or rotating:** delete/recreate the tunnel in Zero
  Trust → Networks → Tunnels, update `CLOUDFLARE_TUNNEL_TOKEN` in `.env`,
  `docker compose up -d` to pick it up.
- **Subdomain changing:** just add/edit the Public Hostname in the tunnel's
  routing config — no DNS record to hand-edit, Cloudflare manages it.
- **Moving off this Arch box entirely:** the app and the tunnel are both
  just containers — `git clone` + `.env` + `docker compose up -d` on the new
  box, same tunnel token if reusing the same tunnel.
