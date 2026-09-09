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
  maxUploadSizeMb: Number(process.env.MAX_UPLOAD_SIZE_MB ?? 100),
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
  // Built frontend to serve alongside the API. Set in the container image so
  // one process serves both; unset in local dev, where Vite serves the SPA on
  // its own port and the API stays API-only.
  frontendPath: process.env.FRONTEND_PATH ?? '',
};
