import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import { buildApp } from '../app.js';
import { config } from '../config.js';

const originalOrigins = config.corsOrigins;

afterEach(() => {
  config.corsOrigins = originalOrigins;
});

/** `buildApp` reads the setting once, so each case builds its own app. */
async function preflight(origin: string) {
  const app = buildApp();
  await app.ready();
  try {
    return await app.inject({
      method: 'OPTIONS',
      url: '/api/tracks',
      headers: { origin, 'access-control-request-method': 'PATCH' },
    });
  } finally {
    await app.close();
  }
}

describe('CORS', () => {
  it('gives another site no CORS headers by default', async () => {
    config.corsOrigins = [];
    const res = await preflight('https://evil.example');
    assert.equal(res.headers['access-control-allow-origin'], undefined);
  });

  it('allows a listed origin, with the full method set', async () => {
    config.corsOrigins = ['https://friend.example'];
    const res = await preflight('https://friend.example');
    assert.equal(res.headers['access-control-allow-origin'], 'https://friend.example');
    assert.match(String(res.headers['access-control-allow-methods']), /PATCH/);
  });

  it('still refuses an unlisted origin when some are listed', async () => {
    config.corsOrigins = ['https://friend.example'];
    const res = await preflight('https://evil.example');
    assert.equal(res.headers['access-control-allow-origin'], undefined);
  });
});
