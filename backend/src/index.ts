import { buildApp } from './app.js';
import { config } from './config.js';
import { startBackupSchedule } from './services/backup.js';
import { startLibrarySyncSchedule } from './services/librarySync.js';
import { startLoudnessBackfill } from './services/loudness.js';
import { startFeaturesBackfill } from './services/audioFeatures.js';
import { formatSecretProblem, inspectJwtSecret } from './utils/secretPolicy.js';

// Checked at server boot, not in config.ts, so `npm run migrate` and the CLI scripts (which never sign) still run.
const secretProblem = inspectJwtSecret(process.env.JWT_SECRET, process.env.NODE_ENV);
if (secretProblem) {
  const message = formatSecretProblem(secretProblem);
  if (secretProblem.fatal) {
    console.error(message);
    process.exit(1);
  }
  console.warn(message);
}

// Open registration is fine on a LAN and an exposure on a public server, so it is announced every boot.
if (config.allowOpenRegistration) {
  console.warn(
    'Open registration is ON: anyone who can reach this server can create an account.\n' +
      'Set ALLOW_OPEN_REGISTRATION=false in backend/.env to make registration admin-only.',
  );
}

// The guest-door posture, announced every boot: since guest entry, this is how people reach the music.
console.info(
  config.entryCode === ''
    ? 'Guest entry: OPEN unless per-guest codes are switched on (web Users page). Anyone who\n' +
        '  can reach this server can otherwise press "enter" and listen. Correct on a LAN. Before\n' +
        '  exposing it (roadmap box 13), put a gate at the network edge, and turn on per-guest\n' +
        '  codes or set ENTRY_CODE in backend/.env as a backstop.'
    : 'Guest entry: requires ENTRY_CODE (or a per-guest code).',
);

const app = buildApp();

app.listen({ port: config.port, host: '0.0.0.0' }, (err, address) => {
  if (err) {
    app.log.error(err);
    process.exit(1);
  }
  app.log.info(`Server listening at ${address}`);

  // Started after listen, not before: a backup is worth taking but never worth
  // delaying the server for, and this way a failure can't stop it booting.
  startBackupSchedule({
    info: (msg) => app.log.info(msg),
    error: (msg) => app.log.error(msg),
  });

  // Same reasoning: worth doing, never worth delaying the server for. The boot
  // pass only stats known paths, so this is cheap even on a large library.
  startLibrarySyncSchedule({
    info: (msg) => app.log.info(msg),
    warn: (msg) => app.log.warn(msg),
    error: (msg) => app.log.error(msg),
  });

  // Measures tracks scanned before levelling existed, then whatever each sync adds. One ffmpeg at a time, reniced.
  startLoudnessBackfill({
    info: (msg) => app.log.info(msg),
    warn: (msg) => app.log.warn(msg),
  });

  // Audio features for smart auto-mixes: a 60 s slice per track, one ffmpeg at a time, reniced (A238).
  startFeaturesBackfill({
    info: (msg) => app.log.info(msg),
    warn: (msg) => app.log.warn(msg),
  });
});
