import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import {
  signMediaToken,
  signToken,
  tokenExpiresAt,
  verifyMediaToken,
  verifySessionToken,
} from './token.js';

const user = { id: 7, username: 'imran' };

describe('session tokens', () => {
  it('round-trips the user', () => {
    assert.deepEqual(verifySessionToken(signToken(user)), user);
  });

  it('rejects a media token presented as a bearer credential', () => {
    // The whole point of the scope claim: a token that leaked via a URL must
    // not buy access to the rest of the API.
    assert.throws(() => verifySessionToken(signMediaToken(user)), /cannot be used as a bearer/);
  });

  it('rejects a token signed with the wrong secret', () => {
    const forged = jwt.sign({ sub: 7, username: 'imran' }, 'not-the-secret', { expiresIn: '1h' });
    assert.throws(() => verifySessionToken(forged));
  });
});

describe('media tokens', () => {
  it('round-trips the user', () => {
    assert.deepEqual(verifyMediaToken(signMediaToken(user)), user);
  });

  it('rejects a session token presented in a media URL', () => {
    // Keeps a long-lived credential out of URLs even if a client tries.
    assert.throws(() => verifyMediaToken(signToken(user)), /Not a media token/);
  });

  it('rejects an expired token', () => {
    const expired = jwt.sign({ sub: 7, username: 'imran', scope: 'media' }, config.jwtSecret, {
      expiresIn: '-1s',
    });
    assert.throws(() => verifyMediaToken(expired), jwt.TokenExpiredError);
  });

  it('expires sooner than a session token', () => {
    assert.ok(tokenExpiresAt(signMediaToken(user)) < tokenExpiresAt(signToken(user)));
  });
});
