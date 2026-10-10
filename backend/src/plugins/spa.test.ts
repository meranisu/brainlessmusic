import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { after, before, describe, it } from 'node:test';
import Fastify, { type FastifyInstance } from 'fastify';
import { makeTempDir } from '../testing/harness.js';
import { registerSpa } from './spa.js';

/** Hashed assets cache for a year; index.html revalidates so a deploy lands on the next load. */
describe('SPA cache headers', () => {
  let app: FastifyInstance;
  let dir: Awaited<ReturnType<typeof makeTempDir>>;

  before(async () => {
    dir = await makeTempDir('spa');
    await mkdir(join(dir.path, 'assets'));
    await writeFile(join(dir.path, 'index.html'), '<!doctype html><title>t</title>');
    await writeFile(join(dir.path, 'assets', 'index-abc123.js'), 'console.log(1)');
    await writeFile(join(dir.path, 'favicon.svg'), '<svg/>');

    app = Fastify();
    assert.equal(registerSpa(app, dir.path), true);
    await app.ready();
  });

  after(async () => {
    await app.close();
    await dir.cleanup();
  });

  it('caches hashed assets for a year', async () => {
    const res = await app.inject({ method: 'GET', url: '/assets/index-abc123.js' });
    assert.equal(res.statusCode, 200);
    assert.equal(res.headers['cache-control'], 'public, max-age=31536000, immutable');
  });

  it('revalidates index.html when asked for directly', async () => {
    const res = await app.inject({ method: 'GET', url: '/' });
    assert.equal(res.statusCode, 200);
    assert.equal(res.headers['cache-control'], 'no-cache');
  });

  it('revalidates index.html served for a client-side route', async () => {
    const res = await app.inject({ method: 'GET', url: '/albums/3', headers: { accept: 'text/html' } });
    assert.equal(res.statusCode, 200);
    assert.equal(res.headers['cache-control'], 'no-cache');
  });

  it('revalidates unhashed files outside /assets/', async () => {
    const res = await app.inject({ method: 'GET', url: '/favicon.svg' });
    assert.equal(res.statusCode, 200);
    assert.equal(res.headers['cache-control'], 'no-cache');
  });
});
