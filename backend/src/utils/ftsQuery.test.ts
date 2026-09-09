import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buildMatchQuery } from './ftsQuery.js';

describe('buildMatchQuery', () => {
  it('quotes a single term as a literal phrase', () => {
    assert.equal(buildMatchQuery('beatles'), '"beatles"');
  });

  it('ANDs multiple terms so they can match in different columns', () => {
    assert.equal(buildMatchQuery('beatles abbey'), '"beatles" AND "abbey"');
  });

  it('collapses surrounding and repeated whitespace', () => {
    assert.equal(buildMatchQuery('  beatles   abbey  '), '"beatles" AND "abbey"');
  });

  it('escapes embedded double quotes by doubling them', () => {
    assert.equal(buildMatchQuery('say "hello" now'), '"say" AND """hello""" AND "now"');
  });

  it('neutralises FTS5 operators typed as ordinary text', () => {
    // These are real things people type into a search box. None of them may
    // reach the parser as syntax.
    assert.equal(buildMatchQuery('foo AND bar'), '"foo" AND "AND" AND "bar"');
    assert.equal(buildMatchQuery('rock NEAR/2 roll'), '"rock" AND "NEAR/2" AND "roll"');
    assert.equal(buildMatchQuery('wildcard*'), '"wildcard*"');
    assert.equal(buildMatchQuery('^anchored'), '"^anchored"');
    // `OR` is two characters, so this one leaves by the short-term door
    // instead — still safe, just answered by LIKE rather than the index.
    assert.equal(buildMatchQuery('foo OR bar'), null);
  });

  it('refuses queries the trigram index cannot answer', () => {
    assert.equal(buildMatchQuery('ab'), null, 'two characters is below the trigram floor');
    assert.equal(buildMatchQuery('林檎'), null, 'a two-character CJK query is ordinary and must fall back');
    assert.equal(buildMatchQuery('beatles ab'), null, 'one short term disqualifies the whole query');
  });

  it('accepts a three-character CJK query, which the index can answer', () => {
    assert.equal(buildMatchQuery('椎名林檎'), '"椎名林檎"');
    assert.equal(buildMatchQuery('サディ'), '"サディ"');
  });

  it('counts code points, not UTF-16 units', () => {
    assert.equal(buildMatchQuery('👍👍'), null, 'two emoji are two characters, not four');
  });

  it('returns null for empty or whitespace-only input', () => {
    assert.equal(buildMatchQuery(''), null);
    assert.equal(buildMatchQuery('   '), null);
  });
});
