import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { redactUrl } from './redactUrl.js';

describe('redactUrl', () => {
  it('hides the token and keeps the other parameters', () => {
    assert.equal(
      redactUrl('/api/tracks/7/stream?token=eyJ.abc.def&quality=low'),
      '/api/tracks/7/stream?token=[redacted]&quality=low',
    );
    assert.equal(redactUrl('/api/tracks/7/cover?size=sm&token=eyJ.abc'), '/api/tracks/7/cover?size=sm&token=[redacted]');
  });

  it('leaves URLs without a token alone, including look-alike names', () => {
    assert.equal(redactUrl('/api/tracks?limit=20'), '/api/tracks?limit=20');
    assert.equal(redactUrl('/api/x?mytoken=keep'), '/api/x?mytoken=keep');
  });
});
