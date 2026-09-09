# Infrastructure — Hardware, Deployment, Networking

## Server hardware

- **CPU:** Ryzen 7 5700x (8c/16t) — far more than enough for audio transcoding
- **RAM:** 24GB DDR4 — plenty of headroom
- **Storage:** 500GB SATA SSD — likely the real constraint long-term. FLAC libraries grow fast (~20-40MB/track); plan for a larger drive (HDD for library + SSD for OS/DB/transcode scratch) before the library grows significantly
- **GPU:** RX580 — not useful for this project; audio transcoding is CPU-only

## Operating system

- Leaning **Arch-based Linux distro** — not finalized, may change depending on server requirements

## Deployment: Docker vs. native package

- **Native (pacman-style)**: simplest initial setup, best raw performance, full access to host hardware
- **Docker**: fully self-contained, portable across OS/distro changes, easier to run multiple services side by side, easy rollback
- **Decision for this project: Docker for deployment** — since the OS choice isn't finalized yet, Docker decouples "what OS" from "how the service is configured," protecting against redoing setup work if the distro changes later
- **Note:** local development is NOT done in Docker — see `.docs/process/dev-environment.md`. Docker is for the eventual deployed server only.

## Networking

- Home internet: **U Mobile 5G Home WiFi** — SIM-based router, not fibre. Unlimited data, 1000GB FUP, upload speed ~150Mbps
- Planning for **2 concurrent streaming users** initially
- **Bandwidth is not a concern**: even 2 concurrent FLAC streams (~1.6–2.8Mbps combined) is a small fraction of 150Mbps upload capacity
- **Data cap is not a concern** at current usage estimates (well under 1000GB/month even with regular use)
- **Seeking/scrubbing**: supported via HTTP byte-range requests; mobile-network latency may add a small delay vs. fibre but shouldn't meaningfully affect audio playback

### CGNAT — open item

Needs to be checked on-site: whether the router is behind **CGNAT** (check WAN IP in router admin panel; `100.64.0.0–100.127.255.255` range = CGNAT). Common on SIM-based mobile routers, and would make traditional port forwarding impossible.

- **If behind CGNAT:** use **Tailscale** (mesh VPN) or **Cloudflare Tunnel** (outbound-only tunnel) instead of port forwarding
- **If not behind CGNAT:** traditional port forwarding + reverse proxy/TLS becomes viable, though VPN/mesh may still be preferable for a small friend group (lower ops/security burden vs. exposing a port publicly)

**Status: not yet checked.**

## Library

- Not built yet — needs to be organized before ingestion
- Mixed formats: **FLAC, Opus, MP3, M4A, occasional OGG**
- Target size: **~30,000 tracks**
- To decide early: consistent tagging convention across formats, folder structure fallback for untagged files, loudness normalization (ReplayGain/R128) since mixed rips vary in level
