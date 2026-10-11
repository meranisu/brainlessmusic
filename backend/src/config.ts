import 'dotenv/config';
import { dirname, join } from 'node:path';

export const config = {
  port: Number(process.env.PORT ?? 3000),
  dbPath: process.env.DB_PATH ?? './data/brainlessmusic.db',
  jwtSecret: process.env.JWT_SECRET ?? 'change-me',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? '7d',
  // Lifetime of `<audio src>` / `<img src>` tokens: outlasts a track, and a leaked URL dies the same afternoon.
  mediaTokenTtl: process.env.MEDIA_TOKEN_TTL ?? '2h',
  // Shared code for the title screen's "enter". Unset (the LAN default) leaves the guest door open. A backstop
  // for a public URL, not a substitute for the network-edge gate (roadmap box 13).
  entryCode: process.env.ENTRY_CODE ?? '',
  // Bounds how far a loop or a curious friend can grow the guest table. Past it, idle guests are pruned, then refused.
  maxGuests: Number(process.env.MAX_GUESTS ?? 50),
  // An untouched guest this old may be pruned at the cap, with its data: nothing can log back into it.
  guestIdleDays: Number(process.env.GUEST_IDLE_DAYS ?? 90),
  // Guests one IP may mint per hour: generous for real devices, ruinous for enumeration.
  guestMintsPerHour: Number(process.env.GUEST_MINTS_PER_HOUR ?? 10),
  // "Request a code" presses one IP may make per hour (A67), and how many may wait for the admin at once.
  guestRequestsPerHour: Number(process.env.GUEST_REQUESTS_PER_HOUR ?? 5),
  maxPendingGuestRequests: Number(process.env.MAX_PENDING_GUEST_REQUESTS ?? 20),
  // Tight on purpose: a 4-8 digit passcode's small keyspace leaves the rate limit as the real guard.
  passcodeAttemptsPerMinute: Number(process.env.PASSCODE_ATTEMPTS_PER_MINUTE ?? 8),
  // Looser than the passcode's; it stops unlimited scripted guesses.
  loginAttemptsPerMinute: Number(process.env.LOGIN_ATTEMPTS_PER_MINUTE ?? 10),
  // Failed sign-ins (password and passcode together) per username per hour, from all addresses: the per-IP limits
  // alone can be dodged by rotating addresses. At 20/hour a 4-digit passcode takes about 10 days on average, not hours.
  accountLoginFailuresPerHour: Number(process.env.ACCOUNT_LOGIN_FAILURES_PER_HOUR ?? 20),
  // Header with the visitor's real IP behind a proxy; unset uses the socket address (right on a LAN). Production
  // sets `cf-connecting-ip`, which Cloudflare overwrites; a direct client on :3000 can still forge it.
  clientIpHeader: (process.env.CLIENT_IP_HEADER ?? '').trim().toLowerCase(),
  // Other origins allowed to call the API from a browser, comma-separated (`null` for `file://`). Empty by default:
  // production is same-origin, and Vite proxies `/api` in dev.
  corsOrigins: (process.env.CORS_ORIGINS ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter((origin) => origin !== ''),
  libraryPath: process.env.LIBRARY_PATH ?? './library',
  uploadStagingPath: process.env.UPLOAD_STAGING_PATH ?? './data/upload-staging',
  // Extracted cover art, content-addressed. Safe to delete; a re-scan rebuilds it.
  artworkPath: process.env.ARTWORK_PATH ?? './data/artwork',
  // Per file. 1024 because one hi-res FLAC can exceed 100 MB. Staging needs about 3× this (the client uploads 3 at
  // once), and a reverse proxy's own body limit must be raised to match.
  maxUploadSizeMb: Number(process.env.MAX_UPLOAD_SIZE_MB ?? 1024),
  // A ceiling on simultaneous ffmpeg encodes. Past it `?quality=low` is refused, never served as the full-size file.
  maxConcurrentTranscodes: Number(process.env.MAX_CONCURRENT_TRANSCODES ?? 2),
  // Lets anyone create an account (index.ts warns at boot). Off by default since A16. The first account is always
  // allowed, counted by accounts, not guests, so a server full of guests can still be claimed.
  allowOpenRegistration: process.env.ALLOW_OPEN_REGISTRATION === 'true',
  // Defaults beside the database, inside the /data volume. Covers corruption, bad migrations and deletion, not disk loss.
  backupEnabled: process.env.BACKUP_ENABLED !== 'false',
  backupPath: process.env.BACKUP_PATH ?? join(dirname(process.env.DB_PATH ?? './data/brainlessmusic.db'), 'backups'),
  backupIntervalHours: Number(process.env.BACKUP_INTERVAL_HOURS ?? 24),
  // Roughly two weeks of dailies. Each is the size of the database, which is
  // dominated by rows rather than audio, so this stays small.
  backupKeep: Number(process.env.BACKUP_KEEP ?? 14),
  // Converted tracks, content-addressed. Safe to delete; each missing entry costs one re-encode.
  transcodePath: process.env.TRANSCODE_PATH ?? './data/transcodes',
  // About 0.57 MB per minute at the data-saver rate (~2.3 GB per 1,000 tracks). LRU eviction after each write; 0 = no cap.
  transcodeCacheMaxMb: Number(process.env.TRANSCODE_CACHE_MAX_MB ?? 2048),
  // Below this multiple of the target the original is served: re-encoding 121 kbps Opus to 64k saves only 36%.
  transcodeMinSourceBitrateRatio: Number(process.env.TRANSCODE_MIN_SOURCE_BITRATE_RATIO ?? 1.5),
  // Boot only stats known paths; the full tag-reading walk runs on the interval, since `tsx watch` restarts on every save.
  libraryScanEnabled: process.env.LIBRARY_SCAN_ENABLED !== 'false',
  libraryScanIntervalHours: Number(process.env.LIBRARY_SCAN_INTERVAL_HOURS ?? 12),
  // Above this share newly missing in one sweep, nothing is marked: an unmounted root looks exactly like a deleted one.
  libraryMissingAbortRatio: Number(process.env.LIBRARY_MISSING_ABORT_RATIO ?? 0.5),
  // Built frontend served by the API. Set in the image; unset in dev, where Vite serves it.
  frontendPath: process.env.FRONTEND_PATH ?? '',
};
