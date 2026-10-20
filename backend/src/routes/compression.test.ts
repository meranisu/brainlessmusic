import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buildApp } from '../app.js';

/** Builds the real app plus two throwaway routes, so the check doesn't depend on library data. */
async function withApp(run: (app: ReturnType<typeof buildApp>) => Promise<void>) {
  const app = buildApp();
  // Inside `register` so the routes are added after the compress plugin has loaded and hooked route creation.
  app.register(async (probe) => {
    probe.get('/compression-probe/json', async () => ({ rows: Array.from({ length: 200 }, (_, i) => ({ id: i, title: `Song ${i}` })) }));
    probe.get('/compression-probe/audio', async (_req, reply) => reply.type('audio/flac').send(Buffer.alloc(4096, 1)));
  });
  await app.ready();
  try {
    await run(app);
  } finally {
    await app.close();
  }
}

describe('response compression', () => {
  it('compresses a large JSON reply when the client accepts gzip', async () => {
    await withApp(async (app) => {
      const res = await app.inject({ method: 'GET', url: '/compression-probe/json', headers: { 'accept-encoding': 'gzip' } });
      assert.equal(res.headers['content-encoding'], 'gzip');
    });
  });

  it('leaves audio alone', async () => {
    await withApp(async (app) => {
      const res = await app.inject({ method: 'GET', url: '/compression-probe/audio', headers: { 'accept-encoding': 'gzip, br' } });
      assert.equal(res.headers['content-encoding'], undefined);
      assert.equal(res.rawPayload.length, 4096);
    });
  });
});
