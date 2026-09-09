import { buildApp } from './app.js';
import { config } from './config.js';
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

const app = buildApp();

app.listen({ port: config.port, host: '0.0.0.0' }, (err, address) => {
  if (err) {
    app.log.error(err);
    process.exit(1);
  }
  app.log.info(`Server listening at ${address}`);
});
