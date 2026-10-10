# brainlessmusic

My own music streaming server, with a web app and an Android app. I built it so I could listen to my own music
library anywhere, mostly on my phone, and share it with a few friends. It's a personal project, not a product.
Most of the code was written with AI coding agents (Claude Code, sometimes Antigravity).

## What it does

- Point it at a folder of music and it builds a library out of it: artists, albums, tracks and cover art
- Plays with a queue, shuffle, repeat, and a waveform you can drag to seek
- Playlists, favorites, search and play history
- A data saver mode that streams tracks as 64 kbps Opus, for when you're on mobile data
- Picks up where you left off, even on another device
- Accounts for you and your friends, an admin role, and guest access for people without an account
- Rescans the library and backs up the database on a schedule

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

Only run tests this way. Running the test files directly can point them at your real music library, and that once
wiped mine.

## License

Apache 2.0, see [LICENSE](LICENSE).
