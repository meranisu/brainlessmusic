import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { likePattern } from './like.js';

describe('likePattern', () => {
  it('wraps in % and escapes LIKE wildcards', () => {
    assert.equal(likePattern('abc'), '%abc%');
    assert.equal(likePattern('50%_x\\'), '%50\\%\\_x\\\\%');
  });
});
