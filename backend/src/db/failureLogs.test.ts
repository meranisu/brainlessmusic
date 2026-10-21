import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';
import { deleteTrackRow, upsertTrack } from './library.js';
import { deleteLibraryRoot, insertLibraryRoot } from './libraryRoots.js';
import {
  PLAYBACK_FAILURES_KEPT,
  countPlaybackFailures,
  listRecentPlaybackFailures,
  recordPlaybackFailure,
} from './playbackFailures.js';
import { ROOM_ISSUES_KEPT, countRoomIssues, listRecentRoomIssues, recordRoomIssue } from './roomIssues.js';
import { countScanFailures, listScanFailures, replaceScanFailures } from './scanFailures.js';
import { db } from './connection.js';
import { deleteUser, insertGuest, insertUser, pruneIdleGuests } from './users.js';
import { resetDatabase } from '../testing/harness.js';

/**
 * Foreign keys don't cascade, so a log table referencing tracks, users or roots blocks their deletion unless that
 * path clears it first. These catch the 500 that otherwise shows up months later.
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

  it('keeps only the newest rows, and clips oversized text', () => {
    const user = insertUser('imran', 'hash');
    const track = addTrack('Loop');
    for (let i = 0; i < PLAYBACK_FAILURES_KEPT + 5; i += 1) {
      recordPlaybackFailure({ userId: user.id, trackId: track.id, source: 'client', message: `failure ${i}` });
    }
    recordPlaybackFailure({
      userId: user.id,
      trackId: track.id,
      source: 'client',
      message: 'x'.repeat(1_000_000),
      userAgent: 'y'.repeat(10_000),
    });

    const count = (db.prepare('SELECT COUNT(*) AS n FROM playback_failures').get() as { n: number }).n;
    assert.equal(count, PLAYBACK_FAILURES_KEPT);
    const [newest] = listRecentPlaybackFailures(1);
    assert.ok(newest.message.length <= 500, 'a megabyte of detail is cut down');
    assert.ok((newest.userAgent ?? '').length <= 200);
    const oldest = db.prepare('SELECT message FROM playback_failures ORDER BY id ASC LIMIT 1').get() as { message: string };
    assert.equal(oldest.message, 'failure 6', 'the oldest rows went first');
  });

  it('pages newest first with an offset, and counts every row', () => {
    const user = insertUser('imran', 'hash');
    const track = addTrack('Broken');
    for (let i = 1; i <= 5; i++) {
      recordPlaybackFailure({ userId: user.id, trackId: track.id, source: 'client', message: `failure ${i}` });
    }

    assert.equal(countPlaybackFailures(), 5);
    assert.deepEqual(listRecentPlaybackFailures(2, 0).map((f) => f.message), ['failure 5', 'failure 4']);
    assert.deepEqual(listRecentPlaybackFailures(2, 2).map((f) => f.message), ['failure 3', 'failure 2']);
    assert.deepEqual(listRecentPlaybackFailures(2, 4).map((f) => f.message), ['failure 1']);
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

describe('room_issues', () => {
  it('lists an issue with who, where and the detail', () => {
    const user = insertUser('imran', 'hash');
    recordRoomIssue({
      userId: user.id,
      source: 'android',
      kind: 'parse-failed',
      message: 'Could not read a room message',
      roomCode: 'ABCDEF',
      detail: 'JsonSyntaxException',
      httpStatus: 500,
      appVersion: '0.4.29',
    });

    const [entry] = listRecentRoomIssues();
    assert.equal(entry.username, 'imran');
    assert.equal(entry.kind, 'parse-failed');
    assert.equal(entry.roomCode, 'ABCDEF');
    assert.equal(entry.httpStatus, 500);
    assert.equal(entry.appVersion, '0.4.29');
  });

  it('keeps only the newest rows, clips oversized text, and pages newest first', () => {
    const user = insertUser('imran', 'hash');
    for (let i = 0; i < ROOM_ISSUES_KEPT + 5; i += 1) {
      recordRoomIssue({ userId: user.id, source: 'web', kind: 'socket-failed', message: `issue ${i}` });
    }
    recordRoomIssue({
      userId: user.id,
      source: 'web',
      kind: 'socket-failed',
      message: 'x'.repeat(1_000_000),
      detail: 'y'.repeat(1_000_000),
    });

    assert.equal(countRoomIssues(), ROOM_ISSUES_KEPT);
    const [newest, second] = listRecentRoomIssues(2, 0);
    assert.ok(newest.message.length <= 500, 'a megabyte of message is cut down');
    assert.ok((newest.detail ?? '').length <= 1000);
    assert.equal(second.message, `issue ${ROOM_ISSUES_KEPT + 4}`);
    assert.equal(listRecentRoomIssues(1, 1)[0].message, second.message);
  });

  it('does not stop a user or an idle guest with issues from being removed', () => {
    const user = insertUser('imran', 'hash');
    const guest = insertGuest();
    recordRoomIssue({ userId: user.id, source: 'web', kind: 'request-failed', message: 'x' });
    recordRoomIssue({ userId: guest.id, source: 'android', kind: 'request-failed', message: 'x' });
    db.prepare("UPDATE users SET last_seen_at = datetime('now', '-400 days') WHERE id = ?").run(guest.id);

    assert.equal(deleteUser(user.id), true);
    assert.equal(pruneIdleGuests(30), 1);
    assert.equal(countRoomIssues(), 0);
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
