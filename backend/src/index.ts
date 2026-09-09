import { buildApp } from './app.js';
import { config } from './config.js';
import { startBackupSchedule } from './services/backup.js';
import { startLibrarySyncSchedule } from './services/librarySync.js';
import { formatSecretProblem, inspectJwtSecret } from './utils/secretPolicy.js';

// Checked here rather than in `config.ts` so it runs when the *server* boots,
// not on every import: `npm run migrate` and the admin CLI scripts never sign
// a token, and refusing to run them over a weak secret would be a confusing
// failure with no security benefit.
const secretProblem = inspectJwtSecret(process.env.JWT_SECRET, process.env.NODE_ENV);
if (secretProblem) {
  const message = formatSecretProblem(secretProblem);
  if (secretProblem.fatal) {
    console.error(message);
    process.exit(1);
  }
  console.warn(message);
}

// Open registration is a deliberate posture, not a default to drift into. It
// is fine on a LAN; on a server reachable from outside it means anyone who
// finds the login page can help themselves to an account. Say so every boot.
if (config.allowOpenRegistration) {
  console.warn(
    'Open registration is ON — anyone who can reach this server can create an account.\n' +
      'Set ALLOW_OPEN_REGISTRATION=false in backend/.env to make registration admin-only.',
  );
}

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
});
