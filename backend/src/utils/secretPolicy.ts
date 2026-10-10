/** Boot-time check of `JWT_SECRET`, whose holder can mint any token, admin included. Pure, for testing. */

/** The fallback in `config.ts`. It is committed to this repository, so it is public. */
export const DEFAULT_JWT_SECRET = 'change-me';

/** HS256 wants 256 bits; 32 characters is the floor, and `randomBytes(32).toString('hex')` gives 64. */
export const MIN_JWT_SECRET_LENGTH = 32;

/** Environments where a weak secret is a warning rather than a refusal. */
const RELAXED_ENVIRONMENTS = new Set(['development', 'test']);

export interface SecretProblem {
  summary: string;
  /** True when the process must stop rather than merely complain. */
  fatal: boolean;
}

/**
 * Takes raw env values, since `config` has already applied the fallback. Fails closed: only development or test is
 * lenient, so an unset NODE_ENV on a VPS is caught.
 */
export function inspectJwtSecret(
  secret: string | undefined,
  nodeEnv: string | undefined,
): SecretProblem | null {
  const summary = describeProblem(secret);
  if (summary === null) return null;

  return { summary, fatal: !RELAXED_ENVIRONMENTS.has((nodeEnv ?? '').trim().toLowerCase()) };
}

function describeProblem(secret: string | undefined): string | null {
  if (secret === undefined || secret.trim() === '') {
    return 'JWT_SECRET is not set, so the server falls back to a default that is committed to this repository.';
  }
  if (secret === DEFAULT_JWT_SECRET) {
    return `JWT_SECRET is still the default ("${DEFAULT_JWT_SECRET}"), which is committed to this repository.`;
  }
  if (secret.length < MIN_JWT_SECRET_LENGTH) {
    return `JWT_SECRET is ${secret.length} characters long; at least ${MIN_JWT_SECRET_LENGTH} are required.`;
  }
  return null;
}

/** The message printed at boot. Actionable: it ends with the exact fix. */
export function formatSecretProblem(problem: SecretProblem): string {
  const heading = problem.fatal
    ? 'Refusing to start: JWT_SECRET is not safe for a real deployment.'
    : 'Warning: JWT_SECRET is not safe for a real deployment (allowed here because NODE_ENV is development or test).';

  return [
    '',
    heading,
    '',
    `  ${problem.summary}`,
    '',
    '  Anyone who knows this secret can mint a valid token for any account,',
    '  including an admin one, without needing a password.',
    '',
    '  Generate a real one:',
    "    node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\"",
    '',
    '  Then put it in backend/.env:',
    '    JWT_SECRET=<the generated value>',
    '',
    '  Changing the secret invalidates every existing session, so everyone',
    '  signs in again once.',
    '',
  ].join('\n');
}
