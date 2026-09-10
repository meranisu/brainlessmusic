import 'dotenv/config';
import { dirname, join } from 'node:path';

export const config = {
  port: Number(process.env.PORT ?? 3000),
  dbPath: process.env.DB_PATH ?? './data/brainlessmusic.db',
  jwtSecret: process.env.JWT_SECRET ?? 'change-me',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? '7d',
  // Lifetime of the scoped tokens that ride in `<audio src>` / `<img src>`
  // URLs. Long enough to outlast any single track (an expired token only
  // breaks a later seek, never audio already streaming), short enough that a
  // leaked URL stops working the same afternoon.
  mediaTokenTtl: process.env.MEDIA_TOKEN_TTL ?? '2h',
  libraryPath: process.env.LIBRARY_PATH ?? './library',
  uploadStagingPath: process.env.UPLOAD_STAGING_PATH ?? './data/upload-staging',
  // Extracted cover art, content-addressed. Safe to delete wholesale — a
  // re-scan rebuilds it from the audio files.
  artworkPath: process.env.ARTWORK_PATH ?? './data/artwork',
  // Per file, not per request. Raised from 100 to 1024 on 2026-09-10, when the
  // library gained FLAC and WAV: 100 MB is under a single hi-res track, so the
  // old ceiling would have rejected legitimate files. The number is a guard
  // against a slip — a whole album dragged in as one file, a wrong folder —
  // rather than against an attacker, because `POST /tracks/upload` is
  // admin-only. The web client uploads 3 at a time, so the real worst case is
  // roughly three times this in staging at once; `UPLOAD_STAGING_PATH` needs
  // to have the room, and a reverse proxy in front of this (step 13) will have
  // its own body limit that must be raised to match or it rejects first.
  maxUploadSizeMb: Number(process.env.MAX_UPLOAD_SIZE_MB ?? 1024),
  // Data-saver transcodes running at once. Each is a full-rate ffmpeg decode
  // on the same machine that serves the app, so this is a ceiling, not a
  // target: past it, `?quality=low` is refused rather than served as the
  // full-size original, which would blow the data budget of the one person
  // who explicitly asked not to.
  maxConcurrentTranscodes: Number(process.env.MAX_CONCURRENT_TRANSCODES ?? 2),
  // Whether anyone who can reach the server may create their own account.
  // Off means registration is admin-only (the first account is always allowed,
  // or there would be no way to bootstrap one). Turning this on is a real
  // exposure once the server is reachable from outside — index.ts warns at
  // boot so it can't be on by accident.
  allowOpenRegistration: process.env.ALLOW_OPEN_REGISTRATION !== 'false',
  // Scheduled SQLite backups. The default puts them beside the database, so
  // they land inside the container's /data volume and survive a rebuild with
  // no extra configuration. That protects against corruption, a bad migration
  // and accidental deletion — not against losing the disk itself.
  backupEnabled: process.env.BACKUP_ENABLED !== 'false',
  backupPath: process.env.BACKUP_PATH ?? join(dirname(process.env.DB_PATH ?? './data/brainlessmusic.db'), 'backups'),
  backupIntervalHours: Number(process.env.BACKUP_INTERVAL_HOURS ?? 24),
  // Roughly two weeks of dailies. Each is the size of the database, which is
  // dominated by rows rather than audio, so this stays small.
  backupKeep: Number(process.env.BACKUP_KEEP ?? 14),
  // Keeping the database honest about what is actually on disk. The boot pass
  // only stats known paths (cheap); the interval does the full tag-reading
  // walk, which is why it isn't run at startup — `tsx watch` restarts on every
  // save in development.
  libraryScanEnabled: process.env.LIBRARY_SCAN_ENABLED !== 'false',
  libraryScanIntervalHours: Number(process.env.LIBRARY_SCAN_INTERVAL_HOURS ?? 12),
  // Above this share of the library newly vanishing in a single sweep, the
  // sweep refuses to mark anything. A library root that has not mounted yet is
  // indistinguishable from one that was deleted, and this project has already
  // lost its music once to that ambiguity — so the ambiguous case does nothing
  // and says so, rather than guessing.
  libraryMissingAbortRatio: Number(process.env.LIBRARY_MISSING_ABORT_RATIO ?? 0.5),
  // Built frontend to serve alongside the API. Set in the container image so
  // one process serves both; unset in local dev, where Vite serves the SPA on
  // its own port and the API stays API-only.
  frontendPath: process.env.FRONTEND_PATH ?? '',
};
