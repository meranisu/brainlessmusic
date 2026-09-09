import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { describe, it } from 'node:test';
import {
  DEFAULT_JWT_SECRET,
  MIN_JWT_SECRET_LENGTH,
  formatSecretProblem,
  inspectJwtSecret,
} from './secretPolicy.js';

const STRONG = 'a'.repeat(MIN_JWT_SECRET_LENGTH);

describe('inspectJwtSecret', () => {
  it('passes a secret that is long enough and not the default', () => {
    assert.equal(inspectJwtSecret(STRONG, 'production'), null);
    assert.equal(inspectJwtSecret(STRONG, undefined), null);
  });

  it('refuses to boot on the committed default outside dev', () => {
    const problem = inspectJwtSecret(DEFAULT_JWT_SECRET, 'production');
    assert.ok(problem);
    assert.equal(problem.fatal, true);
    assert.match(problem.summary, /still the default/);
  });

  it('fails closed when NODE_ENV is unset', () => {
    // The case this check exists for: `npm start` on a VPS, nobody having
    // thought about NODE_ENV. An unset value must not be the lenient path.
    const problem = inspectJwtSecret(DEFAULT_JWT_SECRET, undefined);
    assert.ok(problem);
    assert.equal(problem.fatal, true);
  });

  it('fails closed on an unrecognised NODE_ENV', () => {
    assert.equal(inspectJwtSecret(DEFAULT_JWT_SECRET, 'staging')?.fatal, true);
    assert.equal(inspectJwtSecret(DEFAULT_JWT_SECRET, '')?.fatal, true);
  });

  it('warns instead of refusing in development and test', () => {
    for (const env of ['development', 'test', 'DEVELOPMENT', ' Test ']) {
      const problem = inspectJwtSecret(DEFAULT_JWT_SECRET, env);
      assert.ok(problem, `expected a problem for ${env}`);
      assert.equal(problem.fatal, false, `expected non-fatal for ${env}`);
    }
  });

  it('distinguishes an unset secret from one set to the default', () => {
    assert.match(inspectJwtSecret(undefined, 'production')!.summary, /not set/);
    assert.match(inspectJwtSecret('   ', 'production')!.summary, /not set/);
    assert.match(inspectJwtSecret(DEFAULT_JWT_SECRET, 'production')!.summary, /still the default/);
  });

  it('rejects a secret that is merely short', () => {
    // Setting JWT_SECRET=music is exactly as compromised as leaving the
    // default, and looks configured.
    const problem = inspectJwtSecret('music', 'production');
    assert.ok(problem);
    assert.equal(problem.fatal, true);
    assert.match(problem.summary, /5 characters long/);
  });

  it('accepts exactly the minimum length', () => {
    assert.equal(inspectJwtSecret('b'.repeat(MIN_JWT_SECRET_LENGTH), 'production'), null);
    assert.ok(inspectJwtSecret('b'.repeat(MIN_JWT_SECRET_LENGTH - 1), 'production'));
  });

  it('accepts what the suggested command produces', () => {
    const generated = randomBytes(32).toString('hex');
    assert.equal(inspectJwtSecret(generated, 'production'), null);
  });
});

describe('formatSecretProblem', () => {
  it('says it is refusing when the problem is fatal', () => {
    const message = formatSecretProblem({ summary: 'x', fatal: true });
    assert.match(message, /Refusing to start/);
  });

  it('says it is only warning otherwise', () => {
    const message = formatSecretProblem({ summary: 'x', fatal: false });
    assert.match(message, /^\s*Warning/m);
    assert.doesNotMatch(message, /Refusing to start/);
  });

  it('tells the reader exactly how to fix it', () => {
    const message = formatSecretProblem({ summary: 'x', fatal: true });
    assert.match(message, /randomBytes\(32\)/);
    assert.match(message, /backend\/\.env/);
    // A changed secret logs everyone out; saying so up front avoids a support
    // question that looks like a bug.
    assert.match(message, /invalidates every existing session/);
  });
});
