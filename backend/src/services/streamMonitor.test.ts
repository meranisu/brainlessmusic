import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';
import {
  getHealthSnapshot,
  listActiveSessions,
  recordStreamError,
  resetStreamMonitor,
  streamEnded,
  streamStarted,
} from './streamMonitor.js';

const MINUTE = 60 * 1000;

const listener = (trackId: number) => ({ userId: 1, username: 'imran', trackId, trackTitle: `Track ${trackId}` });

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
    const first = streamStarted(listener(1));
    streamStarted(listener(2));
    assert.equal(getHealthSnapshot().activeStreams, 2);
    streamEnded(first);
    assert.equal(getHealthSnapshot().activeStreams, 1);
  });

  it('never reports a negative stream count', () => {
    // Responses can close more than once; a repeat close must not drift the
    // count below zero and read as "nothing playing" forever after.
    const id = streamStarted(listener(1));
    streamEnded(id);
    streamEnded(id);
    assert.equal(getHealthSnapshot().activeStreams, 0);
  });
});

describe('listActiveSessions', () => {
  it('says who is streaming what, oldest first', () => {
    streamStarted(listener(1));
    streamStarted({ userId: 2, username: 'guest-a1b2c3', trackId: 9, trackTitle: 'Constellations' });
    const sessions = listActiveSessions();
    assert.deepEqual(
      sessions.map((s) => [s.username, s.trackTitle]),
      [
        ['imran', 'Track 1'],
        ['guest-a1b2c3', 'Constellations'],
      ],
    );
  });

  it('drops a session once its stream ends', () => {
    const id = streamStarted(listener(1));
    streamEnded(id);
    assert.deepEqual(listActiveSessions(), []);
  });
});
