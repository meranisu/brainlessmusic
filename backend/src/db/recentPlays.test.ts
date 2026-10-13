import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';
import { upsertTrack } from './library.js';
import { insertLibraryRoot } from './libraryRoots.js';
import { recordScrobble, summarizeRecentPlays } from './plays.js';
import { insertUser } from './users.js';
import { resetDatabase } from '../testing/harness.js';

let trackId = 0;

/** SQLite's `datetime('now')` shape, which is how `played_at` is stored. */
function daysAgo(days: number): string {
  return new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 19).replace('T', ' ');
}

beforeEach(() => {
  resetDatabase();
  const rootId = insertLibraryRoot('/library', null).id;
  trackId = upsertTrack({
    path: '/library/song.mp3',
    title: 'Song',
    artistName: 'Someone',
    albumTitle: 'Something',
    albumYear: null,
    trackNumber: 1,
    duration: 200,
    format: 'MP3',
    fileSize: 1000,
    rootId,
  }).id;
});

describe('summarizeRecentPlays', () => {
  it('counts plays, skips, listeners and minutes in the last day and week', () => {
    const a = insertUser('imran', 'hash');
    const b = insertUser('meran', 'hash');
    recordScrobble(a.id, trackId, 180_000);
    recordScrobble(b.id, trackId, 30_000, null, null, true);
    // Three days ago: in the week, not the day.
    recordScrobble(a.id, trackId, 120_000, daysAgo(3));
    // Ten days ago: in neither.
    recordScrobble(b.id, trackId, 60_000, daysAgo(10));

    const { day, week } = summarizeRecentPlays();
    assert.deepEqual(day, { plays: 1, skips: 1, listeners: 2, minutes: 3 });
    assert.deepEqual(week, { plays: 2, skips: 1, listeners: 2, minutes: 5 });
  });

  it('is all zeros with no history', () => {
    const zero = { plays: 0, skips: 0, listeners: 0, minutes: 0 };
    assert.deepEqual(summarizeRecentPlays(), { day: zero, week: zero });
  });
});
