import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buildApp } from '../app.js';
import { ANDROID_RELEASE_CERT_SHA256, ANDROID_RELEASE_PACKAGE } from './appLinks.js';

describe('Android App Links', () => {
  it('serves assetlinks.json at the root, signed out, naming the release app and key', async () => {
    const app = buildApp();
    await app.ready();
    try {
      const res = await app.inject({ method: 'GET', url: '/.well-known/assetlinks.json' });
      assert.equal(res.statusCode, 200);
      assert.match(String(res.headers['content-type']), /^application\/json/);
      const [statement] = res.json();
      assert.deepEqual(statement.relation, ['delegate_permission/common.handle_all_urls']);
      assert.equal(statement.target.package_name, ANDROID_RELEASE_PACKAGE);
      assert.deepEqual(statement.target.sha256_cert_fingerprints, [ANDROID_RELEASE_CERT_SHA256]);
      // Android compares upper-case, colon-separated pairs: 32 of them for SHA-256.
      assert.match(ANDROID_RELEASE_CERT_SHA256, /^([0-9A-F]{2}:){31}[0-9A-F]{2}$/);
    } finally {
      await app.close();
    }
  });
});
