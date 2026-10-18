import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { randomCode } from './randomCode.js';

describe('randomCode', () => {
  it('has the requested length and only alphabet characters', () => {
    const code = randomCode('AB', 40);
    assert.equal(code.length, 40);
    assert.match(code, /^[AB]+$/);
  });
});
