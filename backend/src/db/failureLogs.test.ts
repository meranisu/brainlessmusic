import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';
import { deleteTrackRow, upsertTrack } from './library.js';
import { deleteLibraryRoot, insertLibraryRoot } from './libraryRoots.js';
import { listRecentPlaybackFailures, recordPlaybackFailure } from './playbackFailures.js';
import { countScanFailures, listScanFailures, replaceScanFailures } from './scanFailures.js';
import { db } from './connection.js';
import { deleteUser, insertGuest, insertUser, pruneIdleGuests } from './users.js';
import { resetDatabase } from '../testing/harness.js';

/**
 * Foreign keys are enforced here and none of them cascade, so a table that
 * references tracks, users or roots silently blocks every path that deletes
 * one of those unless that path clears it first. These tests exist because
 * that is exactly the mistake that is easy to make when adding a log table:
 * the insert works, the list works, and the failure only shows up months
 * later when an admin deletes a broken track and gets a 500.
 */

let rootId = 0;
let nextPath = 0;

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

beforeEach(() => {
  resetDatabase();
  nextPath = 0;
  rootId = insertLibraryRoot('/library', null).id;
});

describe('playback_failures', () => {
  it('lists a failure with who, what and the track title', () => {
    const user = insertUser('imran', 'hash');
    const track = addTrack('Bad Apple!!');
    recordPlaybackFailure({
      userId: user.id,
      trackId: track.id,
      source: 'client',
      message: 'The stream could not be loaded',
      mediaErrorCode: 4,
      contentType: 'audio/ogg',
      userAgent: 'iPhone',
    });

    const [entry] = listRecentPlaybackFailures();
    assert.equal(entry.username, 'imran');
    assert.equal(entry.trackTitle, 'Bad Apple!!');
    assert.equal(entry.mediaErrorCode, 4);
    assert.equal(entry.source, 'client');
  });

  it('does not stop a track with failures from being deleted', () => {
    const user = insertUser('imran', 'hash');
    const track = addTrack('Broken');
    recordPlaybackFailure({ userId: user.id, trackId: track.id, source: 'server', message: 'x' });

    assert.doesNotThrow(() => deleteTrackRow(track.id));
    assert.deepEqual(listRecentPlaybackFailures(), []);
  });

  it('does not stop an idle guest with failures from being pruned', () => {
    const guest = insertGuest();
    const track = addTrack('Broken');
    recordPlaybackFailure({ userId: guest.id, trackId: track.id, source: 'client', message: 'x' });
    db.prepare("UPDATE users SET last_seen_at = datetime('now', '-400 days') WHERE id = ?").run(guest.id);

    assert.equal(pruneIdleGuests(30), 1);
    assert.deepEqual(listRecentPlaybackFailures(), []);
  });

  it('does not stop a user with failures from being deleted', () => {
    const user = insertUser('imran', 'hash');
    const track = addTrack('Broken');
    recordPlaybackFailure({ userId: user.id, trackId: track.id, source: 'client', message: 'x' });

    assert.equal(deleteUser(user.id), true);
  });
});

describe('scan_failures', () => {
  it('replaces a root\'s failures with the latest scan\'s, rather than piling up', () => {
    replaceScanFailures(rootId, [
      { path: '/library/a.mp3', error: 'truncated' },
      { path: '/library/b.mp3', error: 'bad tag block' },
    ]);
    // b.mp3 was fixed; c.mp3 is new.
    replaceScanFailures(rootId, [
      { path: '/library/a.mp3', error: 'truncated' },
      { path: '/library/c.mp3', error: 'unreadable' },
    ]);

    assert.deepEqual(
      listScanFailures().map((f) => f.path).sort(),
      ['/library/a.mp3', '/library/c.mp3'],
    );
    assert.equal(countScanFailures(), 2);
  });

  it('leaves another root\'s failures alone', () => {
    const other = insertLibraryRoot('/mnt/d/music', 'Drive D').id;
    replaceScanFailures(rootId, [{ path: '/library/a.mp3', error: 'x' }]);
    replaceScanFailures(other, [{ path: '/mnt/d/music/z.mp3', error: 'y' }]);

    replaceScanFailures(rootId, []);

    assert.deepEqual(listScanFailures().map((f) => f.rootLabel), ['Drive D']);
  });

  it('does not stop a root with failures from being removed', () => {
    replaceScanFailures(rootId, [{ path: '/library/a.mp3', error: 'x' }]);

    assert.doesNotThrow(() => deleteLibraryRoot(rootId));
    assert.equal(countScanFailures(), 0);
  });
});
