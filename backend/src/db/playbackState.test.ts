import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';
import { clearTracksMissing, deleteTrackRow, markTracksMissing, upsertTrack } from './library.js';
import { insertLibraryRoot } from './libraryRoots.js';
import { clearPlaybackState, loadPlaybackState, savePlaybackState } from './playbackState.js';
import { insertUser } from './users.js';
import { resetDatabase } from '../testing/harness.js';

/**
 * The saving is trivial; the loading is not. A queue is saved as ids and can be
 * loaded days later, by which time tracks in it may have been deleted or gone
 * missing from disk. Restoring someone into a track that cannot play is worse
 * than not restoring them, because it looks like the feature worked.
 */

let nextPath = 0;
let rootId = 0;

function addTrack(title: string) {
  return upsertTrack({
    path: `/library/${nextPath++}-${title}.mp3`,
    title,
    artistName: 'Someone',
    albumTitle: 'Something',
    albumYear: null,
    trackNumber: 1,
    duration: 100,
    format: 'MP3',
    fileSize: 1000,
    rootId,
  });
}

function makeUser(username = 'listener') {
  return insertUser(username, 'hash');
}

describe('playback state', () => {
  beforeEach(() => {
    resetDatabase();
    nextPath = 0;
    rootId = insertLibraryRoot('/library', null).id;
  });

  it('returns null for a user who has never played anything', () => {
    assert.equal(loadPlaybackState(makeUser().id), null);
  });

  it('round-trips a queue, hydrating ids into rows', () => {
    const user = makeUser();
    const a = addTrack('A');
    const b = addTrack('B');

    savePlaybackState(user.id, { queue: [a.id, b.id], queueIndex: 1, positionSeconds: 42.5 });

    const state = loadPlaybackState(user.id);
    assert.ok(state);
    assert.deepEqual(state.queue.map((t) => t.id), [a.id, b.id]);
    assert.equal(state.queue[0].title, 'A');
    assert.equal(state.queueIndex, 1);
    assert.equal(state.positionSeconds, 42.5);
    assert.equal(state.queueRepaired, false);
  });

  it('keeps a fractional position, because rounding is an audible skip', () => {
    const user = makeUser();
    const a = addTrack('A');
    savePlaybackState(user.id, { queue: [a.id], queueIndex: 0, positionSeconds: 12.75 });
    assert.equal(loadPlaybackState(user.id)!.positionSeconds, 12.75);
  });

  it('keeps exactly one row per user — the last write wins', () => {
    const user = makeUser();
    const a = addTrack('A');
    const b = addTrack('B');

    savePlaybackState(user.id, { queue: [a.id], queueIndex: 0, positionSeconds: 1 });
    savePlaybackState(user.id, { queue: [b.id], queueIndex: 0, positionSeconds: 2 });

    const state = loadPlaybackState(user.id)!;
    assert.deepEqual(state.queue.map((t) => t.id), [b.id]);
    assert.equal(state.positionSeconds, 2);
  });

  it('keeps two users apart', () => {
    const one = makeUser('one');
    const two = makeUser('two');
    const a = addTrack('A');
    const b = addTrack('B');

    savePlaybackState(one.id, { queue: [a.id], queueIndex: 0, positionSeconds: 5 });
    savePlaybackState(two.id, { queue: [b.id], queueIndex: 0, positionSeconds: 9 });

    assert.equal(loadPlaybackState(one.id)!.queue[0].id, a.id);
    assert.equal(loadPlaybackState(two.id)!.queue[0].id, b.id);
  });

  it('drops a missing track and re-derives the index around it', () => {
    const user = makeUser();
    const a = addTrack('A');
    const b = addTrack('B');
    const c = addTrack('C');

    savePlaybackState(user.id, { queue: [a.id, b.id, c.id], queueIndex: 2, positionSeconds: 30 });
    markTracksMissing([b.id], '2026-09-10T00:00:00Z');

    const state = loadPlaybackState(user.id)!;
    // B is gone, so C is now at index 1 — the listener stays on C, not on
    // whatever happens to sit at the old index 2.
    assert.deepEqual(state.queue.map((t) => t.id), [a.id, c.id]);
    assert.equal(state.queueIndex, 1);
    assert.equal(state.queue[state.queueIndex].id, c.id);
    assert.equal(state.positionSeconds, 30);
    assert.equal(state.queueRepaired, true);
  });

  it('drops a deleted track the same way it drops a missing one', () => {
    const user = makeUser();
    const a = addTrack('A');
    const b = addTrack('B');

    savePlaybackState(user.id, { queue: [a.id, b.id], queueIndex: 0, positionSeconds: 3 });
    deleteTrackRow(b.id);

    const state = loadPlaybackState(user.id)!;
    assert.deepEqual(state.queue.map((t) => t.id), [a.id]);
    assert.equal(state.queueRepaired, true);
  });

  it('moves forward, not back, when the track being played is gone', () => {
    const user = makeUser();
    const a = addTrack('A');
    const b = addTrack('B');
    const c = addTrack('C');

    savePlaybackState(user.id, { queue: [a.id, b.id, c.id], queueIndex: 1, positionSeconds: 55 });
    markTracksMissing([b.id], '2026-09-10T00:00:00Z');

    const state = loadPlaybackState(user.id)!;
    // Partway through a queue, the next survivor is a better guess than its
    // start — and the old position belongs to a track nobody is playing now.
    assert.equal(state.queue[state.queueIndex].id, c.id);
    assert.equal(state.positionSeconds, 0);
  });

  it('falls back to the start when the played track was the last survivor', () => {
    const user = makeUser();
    const a = addTrack('A');
    const b = addTrack('B');

    savePlaybackState(user.id, { queue: [a.id, b.id], queueIndex: 1, positionSeconds: 55 });
    markTracksMissing([b.id], '2026-09-10T00:00:00Z');

    const state = loadPlaybackState(user.id)!;
    assert.equal(state.queue[state.queueIndex].id, a.id);
    assert.equal(state.positionSeconds, 0);
  });

  it('returns null when nothing in the queue can play any more', () => {
    const user = makeUser();
    const a = addTrack('A');

    savePlaybackState(user.id, { queue: [a.id], queueIndex: 0, positionSeconds: 10 });
    markTracksMissing([a.id], '2026-09-10T00:00:00Z');

    assert.equal(loadPlaybackState(user.id), null);
  });

  it('restores a track that came back from missing', () => {
    const user = makeUser();
    const a = addTrack('A');

    savePlaybackState(user.id, { queue: [a.id], queueIndex: 0, positionSeconds: 10 });
    markTracksMissing([a.id], '2026-09-10T00:00:00Z');
    assert.equal(loadPlaybackState(user.id), null);

    // A mount that came back. The reconcile sweep clears the flag; a scan
    // alone does not, which is why `syncLibrary` always runs both.
    clearTracksMissing([a.id]);
    const state = loadPlaybackState(user.id)!;
    assert.equal(state.queue[0].id, a.id);
    assert.equal(state.positionSeconds, 10);
  });

  it('clears on request', () => {
    const user = makeUser();
    const a = addTrack('A');
    savePlaybackState(user.id, { queue: [a.id], queueIndex: 0, positionSeconds: 1 });
    clearPlaybackState(user.id);
    assert.equal(loadPlaybackState(user.id), null);
  });
});
