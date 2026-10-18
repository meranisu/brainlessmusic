import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { parseId } from './parseId.js';

describe('parseId', () => {
  it('accepts positive integers', () => {
    assert.equal(parseId('1'), 1);
    assert.equal(parseId('42'), 42);
  });
  it('rejects zero, negatives, fractions, text and empty', () => {
    for (const raw of ['0', '-3', '1.5', 'abc', '', undefined, 'NaN', 'Infinity']) {
      assert.equal(parseId(raw), undefined, String(raw));
    }
  });
});
