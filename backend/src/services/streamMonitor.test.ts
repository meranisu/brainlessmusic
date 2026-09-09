import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';
import {
  getHealthSnapshot,
  recordStreamError,
  resetStreamMonitor,
  streamEnded,
  streamStarted,
} from './streamMonitor.js';

const MINUTE = 60 * 1000;

beforeEach(() => {
  resetStreamMonitor();
});

describe('getHealthSnapshot', () => {
  it('is ok on a quiet server', () => {
    const snapshot = getHealthSnapshot();
    assert.equal(snapshot.status, 'ok');
    assert.deepEqual(snapshot.recentErrors, []);
  });

  it('reports degraded while an error is recent', () => {
    recordStreamError(1, 'Track file is missing from disk');
    assert.equal(getHealthSnapshot().status, 'degraded');
  });

  it('recovers once the error falls outside the window', () => {
    // The whole point of the fix: health was previously degraded if the error
    // ring held anything at all, and the ring is only trimmed by length — so
    // one missing file at boot pinned the server to "degraded" for its whole
    // life, which is the same as reporting nothing at all.
    recordStreamError(1, 'Track file is missing from disk');
    assert.equal(getHealthSnapshot(Date.now() + 16 * MINUTE).status, 'ok');
  });

  it('keeps listing an expired error as history', () => {
    // The verdict expires; the record does not. "What went wrong earlier?" is
    // still the question the diagnostics page exists to answer.
    recordStreamError(1, 'Track file is missing from disk');
    const snapshot = getHealthSnapshot(Date.now() + 16 * MINUTE);
    assert.equal(snapshot.recentErrors.length, 1);
    assert.equal(snapshot.recentErrors[0].trackId, 1);
  });

  it('stays degraded when an old error is followed by a fresh one', () => {
    recordStreamError(1, 'old');
    recordStreamError(2, 'fresh');
    assert.equal(getHealthSnapshot().status, 'degraded');
  });

  it('counts active streams up and back down', () => {
    streamStarted();
    streamStarted();
    assert.equal(getHealthSnapshot().activeStreams, 2);
    streamEnded();
    assert.equal(getHealthSnapshot().activeStreams, 1);
  });

  it('never reports a negative stream count', () => {
    // Responses can close more than once; the counter must not drift below
    // zero and read as "nothing playing" forever after.
    streamEnded();
    streamEnded();
    assert.equal(getHealthSnapshot().activeStreams, 0);
  });
});
