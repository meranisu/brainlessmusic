# Infrastructure — Hardware, Deployment, Networking

## Server hardware

**Superseded 2026-09-16 ([A20](../QUESTIONS.md#a20--which-os-for-the-server-was-q3)):**
deployment moved to a friend's existing Arch Linux gaming PC, staying on
24/7, rather than a dedicated build. The spec below described the
originally-planned home server hardware and no longer reflects the current
plan; the friend's machine's actual specs aren't documented yet.

- **CPU:** Ryzen 7 5700x (8c/16t) — far more than enough for audio transcoding
- **RAM:** 24GB DDR4 — plenty of headroom
- **Storage:** 500GB SATA SSD — likely the real constraint long-term. FLAC libraries grow fast (~20-40MB/track); plan for a larger drive (HDD for library + SSD for OS/DB/transcode scratch) before the library grows significantly
- **GPU:** RX580 — not useful for this project; audio transcoding is CPU-only

## Operating system

**Decided 2026-09-16:** **Arch Linux**, on a friend's gaming PC. See
[A20](../QUESTIONS.md#a20--which-os-for-the-server-was-q3).

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

### CGNAT — resolved, moot

**Resolved 2026-09-16 ([A21](../QUESTIONS.md#a21--is-the-home-network-behind-cgnat-was-q1)):**
decided on a **Cloudflare Tunnel** (outbound-only `cloudflared`) instead of
port forwarding, which needs no inbound port at all — so whether the network
is behind CGNAT never needed checking. Domain `nobrainmusic.my` is on
Cloudflare DNS; a Cloudflare Access application gates the tunnel's public
hostname behind an email-allowlist login as defense-in-depth. Full
walkthrough: `.docs/ops/cloudflare-tunnel-deployment.md`.

Note this also changes the network this section originally assumed above —
the app is deploying on a friend's Arch Linux PC, not the U Mobile 5G Home
WiFi connection described below, which may still be relevant if that
changes again.

## Library

- Not built yet — needs to be organized before ingestion
- Mixed formats: **FLAC, Opus, MP3, M4A, occasional OGG**
- Target size: **~30,000 tracks**
- To decide early: consistent tagging convention across formats, folder structure fallback for untagged files, loudness normalization (ReplayGain/R128) since mixed rips vary in level
