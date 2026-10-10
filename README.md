# brainlessmusic

A self-hosted music streaming server with a web app and an Android app. Personal project, built for me and a few
friends. Most of the code was written with AI coding agents (Claude Code, sometimes Antigravity).

## Features

- Scans a folder of audio files into a library (artists, albums, tracks, cover art)
- Player with queue, shuffle, repeat, seeking and a waveform scrubber
- Playlists, favorites, search and play history
- Data saver mode (converts tracks to 64 kbps Opus)
- Resume where you left off, across devices
- Guest access and user accounts, with an admin role
- Scheduled library sync and database backups

## Tech stack

| Part | Tech |
|---|---|
| Backend | Node.js, TypeScript, Fastify, SQLite, ffmpeg |
| Web app | React, TypeScript, Vite, Tailwind |
| Android app | Kotlin, Jetpack Compose |
| Deployment | Docker, Cloudflare Tunnel |

## Project structure

```
backend/    API server
frontend/   web app
android/    Android app
.docs/      planning and reference docs
```

## Running it

**Requirements:** Node.js, plus `ffmpeg` and `ffprobe` on your `PATH`.

Backend (runs on port 3000):

```bash
cd backend
npm install
cp .env.example .env   # set LIBRARY_PATH to your music folder and JWT_SECRET to a long random string
npm run migrate
npm run dev
```

Web app (runs on port 5180):

```bash
cd frontend
npm install
npm run dev
```

Android app:

```bash
cd android
./gradlew assembleDebug
```

With Docker (one container serves both the API and the web app):

```bash
echo "JWT_SECRET=<long random string>" > .env
echo "LIBRARY_DIR=/path/to/your/music" >> .env
docker compose up -d
```

Then open `http://localhost:3000`.

Configuration, backups and the API are covered in [.docs/reference/server-guide.md](.docs/reference/server-guide.md).

## Tests

```bash
cd backend
npm test
```

Only run tests this way. Running the test files directly can point them at your real music library.

## License

Apache 2.0, see [LICENSE](LICENSE).
