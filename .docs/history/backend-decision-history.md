# History: How We Landed on the Custom Backend

Chronological record of the backend architecture decision, for future reference on "why did we decide this."

---

## 1. Initial framing

Personal, self-hosted music streaming setup for personal use and a couple of friends, including on-the-road/bike-trip listening. Not a public product — small-scale.

Already running **Navidrome** (OpenSubsonic-compatible, Go, GPL-3.0) on the home server. Confirmed solid for scanning, tagging, multi-format transcoding, multi-user auth.

Key gap identified early: **synced multi-listener playback ("room" sessions)** — Spotify Jam-style shared playback with skip capability — is explicitly *not* supported by the Subsonic/OpenSubsonic API, confirmed via Navidrome maintainer discussion, and considered out of scope by Navidrome's own maintainers.

## 2. Four server-side paths compared

1. Custom app on Navidrome's existing API only — fastest, reuses solved problems, but no native real-time/social features.
2. Fully custom backend from scratch — full control, but re-implements scanning/tagging/transcoding across 5 formats.
3. **Hybrid** — keep Navidrome for library/streaming/transcoding, build a thin custom API + WebSocket "room" service alongside it.
4. **Fork Navidrome directly** — full access to both Subsonic API and Navidrome's Native REST API, but ongoing merge burden against upstream.

## 3. First resolution: Hybrid → Fork

Initially settled on the **hybrid** approach (option 3), then revised to **forking Navidrome directly** (option 4). Reasoning at the time: at this project's scale, reduced ops complexity (one binary, one DB, one auth system) outweighs the upstream-merge burden of modifying core.

This became the "primary plan" for a period, with a parallel **Version 2** track proposed as a learning exercise: a from-scratch Node.js/TypeScript backend mimicking Navidrome's core functionality, explicitly scoped down and not intended to replace the fork as the "real" deployment.

## 4. Final resolution: Navidrome dropped entirely, Version 2 becomes primary

Decision: **not using Navidrome at all.** The custom Node.js/TypeScript (Fastify) backend — previously the "Version 2 learning track" — is now the actual, only backend for this project (`nobrainmusic` / `brainlessmusic` repo).

Reasoning: the learning-exercise goals (hands-on experience with scanning, tag parsing, transcoding, auth, and room sync) became the actual project goals, rather than a side track next to a Navidrome fork.

Consequence: the Android client's Phase 0 plan, originally written against Navidrome's Subsonic token-auth scheme (`md5(password+salt)`), was revised to use plain JWT auth (`POST /auth/login` → bearer token) against the custom backend instead.

## Current state

See `.docs/reference/tech-stack.md` for the resolved stack, and `.docs/STATUS.md` for what's actually been built so far.
