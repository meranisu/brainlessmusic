import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';
import { db } from './connection.js';
import { upsertTrack } from './library.js';
import { insertLibraryRoot } from './libraryRoots.js';
import { insertUser } from './users.js';
import { starTrack } from './favorites.js';
import { markLessOften } from './lessOften.js';
import { checkRules, evaluateRules, smartSeed, summarizeRules, type SmartRule, type SmartRules } from './smartPlaylists.js';
import { resetDatabase } from '../testing/harness.js';

/** Smart playlist rules (A207, A208): what each field picks, and what input is refused. */

let alice: number;
let bob: number;
/** t[0..4], made in beforeEach: see the table there for what each one is. */
let t: number[];

function play(userId: number, trackId: number, daysAgo: number, skipped = 0) {
  db.prepare(
    `INSERT INTO play_history (user_id, track_id, played_at, ms_played, skipped)
     VALUES (?, ?, datetime('now', ?), 1000, ?)`,
  ).run(userId, trackId, `-${daysAgo} days`, skipped);
}

function like(userId: number, trackId: number) {
  db.prepare('INSERT INTO favorites (user_id, track_id) VALUES (?, ?)').run(userId, trackId);
}

function dislike(userId: number, trackId: number) {
  db.prepare('INSERT INTO less_often (user_id, track_id) VALUES (?, ?)').run(userId, trackId);
}

function rulesOf(rules: SmartRule[], extra: Partial<SmartRules> = {}): SmartRules {
  return { v: 1, match: 'all', rules, sort: 'title', limit: 100, ...extra };
}

function idsFor(userId: number, rules: SmartRule[], extra: Partial<SmartRules> = {}): number[] {
  return evaluateRules(rulesOf(rules, extra), userId)
    .map((x) => x.id)
    .sort((a, b) => a - b);
}

beforeEach(() => {
  resetDatabase();
  alice = insertUser('alice', 'hash').id;
  bob = insertUser('bob', 'hash').id;
  const rootId = insertLibraryRoot('/library', null).id;
  // Title, artist, album year, duration (s), days since added:
  //   A Rock Song   Foo Fighters  1999  200  400
  //   B Pop Song    Bar Band      2010  120   10
  //   C Jazz Tune   Café Quartet  1965  400  200
  //   D Old Rock    Foo Fighters  1999  250  100
  //   E Quick One   Zed           2020   60    1
  const rows = [
    ['A Rock Song', 'Foo Fighters', 1999, 200, 400],
    ['B Pop Song', 'Bar Band', 2010, 120, 10],
    ['C Jazz Tune', 'Café Quartet', 1965, 400, 200],
    ['D Old Rock', 'Foo Fighters', 1999, 250, 100],
    ['E Quick One', 'Zed', 2020, 60, 1],
  ] as const;
  t = rows.map(([title, artistName, albumYear, duration, daysAdded], i) => {
    const id = upsertTrack({
      path: `/library/${i}.mp3`,
      title,
      artistName,
      albumTitle: `Album ${i}`,
      albumYear,
      trackNumber: 1,
      duration,
      format: 'MP3',
      fileSize: 1000,
      rootId,
    }).id;
    db.prepare(`UPDATE tracks SET date_added = datetime('now', ?) WHERE id = ?`).run(`-${daysAdded} days`, id);
    return id;
  });
});

describe("plays are the viewer's own (A208)", () => {
  it('"not played in 60 days" keeps old and never-played tracks, drops recent ones', () => {
    play(alice, t[0], 100);
    play(alice, t[1], 5);
    const rule: SmartRule = { field: 'lastPlayed', op: 'olderThanDays', value: 60 };
    assert.deepEqual(idsFor(alice, [rule]), [t[0], t[2], t[3], t[4]]);
  });

  it("another user's plays change nothing", () => {
    play(bob, t[2], 1);
    play(bob, t[3], 1);
    const rule: SmartRule = { field: 'lastPlayed', op: 'olderThanDays', value: 60 };
    assert.deepEqual(idsFor(alice, [rule]), t);
  });

  it('a skip is not a play', () => {
    play(alice, t[1], 1, 1);
    assert.deepEqual(idsFor(alice, [{ field: 'lastPlayed', op: 'never' }]), t);
  });

  it('"played in the last 7 days" and "never played"', () => {
    play(alice, t[1], 5);
    play(alice, t[0], 100);
    assert.deepEqual(idsFor(alice, [{ field: 'lastPlayed', op: 'withinDays', value: 7 }]), [t[1]]);
    assert.deepEqual(idsFor(alice, [{ field: 'lastPlayed', op: 'never' }]), [t[2], t[3], t[4]]);
  });

  it("myPlays counts only this user's non-skipped plays", () => {
    play(alice, t[0], 1);
    play(alice, t[0], 2);
    play(alice, t[0], 3, 1);
    play(bob, t[0], 1);
    assert.deepEqual(idsFor(alice, [{ field: 'myPlays', op: 'eq', value: 2 }]), [t[0]]);
    assert.deepEqual(idsFor(alice, [{ field: 'myPlays', op: 'gt', value: 1 }]), [t[0]]);
    assert.deepEqual(idsFor(alice, [{ field: 'myPlays', op: 'eq', value: 0 }]), [t[1], t[2], t[3], t[4]]);
  });
});

describe('"liked but rarely played"', () => {
  it('needs both rules under match all', () => {
    like(alice, t[0]);
    like(alice, t[1]);
    for (let i = 1; i <= 5; i++) play(alice, t[1], i);
    play(alice, t[0], 3);
    const rules: SmartRule[] = [
      { field: 'liked', op: 'is', value: true },
      { field: 'myPlays', op: 'lt', value: 3 },
    ];
    assert.deepEqual(idsFor(alice, rules), [t[0]]);
  });

  it("another user's likes do not count", () => {
    like(bob, t[0]);
    assert.deepEqual(idsFor(alice, [{ field: 'liked', op: 'is', value: true }]), []);
  });

  it('match any joins the rules with OR', () => {
    like(alice, t[0]);
    const rules: SmartRule[] = [
      { field: 'liked', op: 'is', value: true },
      { field: 'dateAdded', op: 'withinDays', value: 5 },
    ];
    assert.deepEqual(idsFor(alice, rules, { match: 'any' }), [t[0], t[4]]);
    assert.deepEqual(idsFor(alice, rules, { match: 'all' }), []);
  });
});

describe('exclusions', () => {
  const unplayed: SmartRule = { field: 'myPlays', op: 'eq', value: 0 };

  it('hidden and missing tracks never appear', () => {
    db.prepare('UPDATE tracks SET hidden = 1 WHERE id = ?').run(t[0]);
    db.prepare(`UPDATE tracks SET missing_since = datetime('now') WHERE id = ?`).run(t[1]);
    assert.deepEqual(idsFor(alice, [unplayed]), [t[2], t[3], t[4]]);
  });

  it('a disliked track is left out unless a rule asks about disliked (A211)', () => {
    dislike(alice, t[2]);
    assert.deepEqual(idsFor(alice, [unplayed]), [t[0], t[1], t[3], t[4]]);
    assert.deepEqual(idsFor(alice, [{ field: 'disliked', op: 'is', value: true }]), [t[2]]);
    // Someone else's dislike does not hide it from alice.
    dislike(bob, t[0]);
    assert.deepEqual(idsFor(alice, [unplayed]), [t[0], t[1], t[3], t[4]]);
  });
});

describe('library fields', () => {
  it('genre is / isNot, without case', () => {
    const g = db.prepare(`INSERT INTO genres (name) VALUES ('Rock')`).run().lastInsertRowid;
    for (const id of [t[0], t[3]]) db.prepare('INSERT INTO track_genres (track_id, genre_id) VALUES (?, ?)').run(id, g);
    assert.deepEqual(idsFor(alice, [{ field: 'genre', op: 'is', value: 'rOCK' }]), [t[0], t[3]]);
    assert.deepEqual(idsFor(alice, [{ field: 'genre', op: 'isNot', value: 'rock' }]), [t[1], t[2], t[4]]);
  });

  it('artist is and contains, ignoring case and accents, with % literal', () => {
    assert.deepEqual(idsFor(alice, [{ field: 'artist', op: 'is', value: 'foo fighters' }]), [t[0], t[3]]);
    assert.deepEqual(idsFor(alice, [{ field: 'artist', op: 'contains', value: 'CAFE' }]), [t[2]]);
    assert.deepEqual(idsFor(alice, [{ field: 'artist', op: 'contains', value: '%' }]), []);
  });

  it('year, duration and dateAdded', () => {
    assert.deepEqual(idsFor(alice, [{ field: 'year', op: 'lt', value: 2000 }]), [t[0], t[2], t[3]]);
    assert.deepEqual(idsFor(alice, [{ field: 'year', op: 'eq', value: 2010 }]), [t[1]]);
    assert.deepEqual(idsFor(alice, [{ field: 'duration', op: 'gt', value: 240 }]), [t[2], t[3]]);
    assert.deepEqual(idsFor(alice, [{ field: 'dateAdded', op: 'withinDays', value: 30 }]), [t[1], t[4]]);
    assert.deepEqual(idsFor(alice, [{ field: 'dateAdded', op: 'olderThanDays', value: 150 }]), [t[0], t[2]]);
  });
});

describe('sort and limit', () => {
  const unplayed: SmartRule = { field: 'myPlays', op: 'eq', value: 0 };

  it('limit cuts the list and positions count from 0', () => {
    const out = evaluateRules(rulesOf([unplayed], { limit: 2 }), alice);
    assert.equal(out.length, 2);
    assert.deepEqual(
      out.map((x) => x.position),
      [0, 1],
    );
  });

  it('title, dateAddedDesc and lastPlayedAsc put tracks in order', () => {
    const order = (sort: SmartRules['sort']) => evaluateRules(rulesOf([unplayed], { sort }), alice).map((x) => x.id);
    assert.deepEqual(order('title'), t);
    assert.deepEqual(order('dateAddedDesc'), [t[4], t[1], t[3], t[2], t[0]]);

    play(alice, t[0], 100);
    play(alice, t[1], 5);
    const played: SmartRule = { field: 'myPlays', op: 'gt', value: 0 };
    assert.deepEqual(
      evaluateRules(rulesOf([played], { sort: 'lastPlayedAsc' }), alice).map((x) => x.id),
      [t[0], t[1]],
    );
  });

  it('myPlaysDesc puts the most played first', () => {
    play(alice, t[3], 1);
    play(alice, t[3], 2);
    play(alice, t[1], 1);
    const recent: SmartRule = { field: 'lastPlayed', op: 'withinDays', value: 30 };
    const ids = evaluateRules(rulesOf([recent], { sort: 'myPlaysDesc' }), alice).map((x) => x.id);
    assert.deepEqual(ids, [t[3], t[1]]);
  });
});

describe('random order (kept for the day)', () => {
  const unplayed: SmartRule = { field: 'myPlays', op: 'eq', value: 0 };
  const order = (seed: number, limit = 100) =>
    evaluateRules(rulesOf([unplayed], { sort: 'random', limit }), alice, seed).map((x) => x.id);

  it('is the same list every time for the same seed, with every song once', () => {
    assert.deepEqual(order(500), order(500));
    assert.deepEqual([...order(500)].sort((a, b) => a - b), t);
  });

  it('keeps the same songs when a limit cuts the list, and another seed picks others', () => {
    assert.deepEqual(order(500, 2), order(500, 2));
    const picks = new Set([500, 501, 502, 503].map((seed) => order(seed, 2).join()));
    assert.ok(picks.size > 1, 'four seeds gave one and the same pair');
  });

  it('smartSeed holds within a day and differs between playlists', () => {
    assert.equal(smartSeed(3), smartSeed(3));
    assert.notEqual(smartSeed(3), smartSeed(4));
  });
});

describe('summarizeRules (kept between calls)', () => {
  const liked: SmartRule = { field: 'liked', op: 'is', value: true };
  const unplayed: SmartRule = { field: 'myPlays', op: 'eq', value: 0 };

  it('counts like evaluateRules does, and the covers are different albums by title', () => {
    const summary = summarizeRules(rulesOf([unplayed]), alice);
    assert.equal(summary.trackCount, evaluateRules(rulesOf([unplayed]), alice).length);
    assert.equal(summary.coverAlbumIds.length, 4);
    assert.equal(new Set(summary.coverAlbumIds).size, 4);
  });

  it('respects the limit', () => {
    assert.equal(summarizeRules(rulesOf([unplayed], { limit: 2 }), alice).trackCount, 2);
  });

  it('is kept, and a like or a dislike drops it at once', () => {
    assert.equal(summarizeRules(rulesOf([liked]), alice).trackCount, 0);
    // Written behind its back: the kept answer still stands.
    db.prepare('INSERT INTO favorites (user_id, track_id) VALUES (?, ?)').run(alice, t[0]);
    assert.equal(summarizeRules(rulesOf([liked]), alice).trackCount, 0);
    // Through the app's own write: forgotten.
    starTrack(alice, t[1]);
    assert.equal(summarizeRules(rulesOf([liked]), alice).trackCount, 2);
    markLessOften(alice, t[0]);
    assert.equal(summarizeRules(rulesOf([liked]), alice).trackCount, 1);
  });

  it("one user's change leaves another's kept answer alone", () => {
    assert.equal(summarizeRules(rulesOf([unplayed]), bob).trackCount, 5);
    starTrack(alice, t[0]);
    db.prepare('UPDATE tracks SET hidden = 1 WHERE id = ?').run(t[0]);
    // bob's answer was kept, so the hidden song shows until it expires; alice's was never kept.
    assert.equal(summarizeRules(rulesOf([unplayed]), bob).trackCount, 5);
    assert.equal(summarizeRules(rulesOf([unplayed]), alice).trackCount, 4);
  });
});

describe('checkRules', () => {
  const good = { match: 'any', sort: 'title', limit: 5, rules: [{ field: 'myPlays', op: 'lt', value: 3 }] };

  it('accepts a good set and fills defaults', () => {
    const out = checkRules({ rules: [{ field: 'liked', op: 'is', value: true }] });
    assert.deepEqual(out, {
      rules: { v: 1, match: 'all', sort: 'random', limit: 100, rules: [{ field: 'liked', op: 'is', value: true }] },
    });
    assert.ok('rules' in checkRules(good));
  });

  it('drops keys it does not know', () => {
    const out = checkRules({ rules: [{ field: 'liked', op: 'is', value: true, sql: 'DROP TABLE tracks' }], evil: 1 });
    assert.ok('rules' in out);
    if ('rules' in out) assert.deepEqual(Object.keys(out.rules.rules[0]).sort(), ['field', 'op', 'value']);
  });

  const bad: [string, unknown][] = [
    ['not an object', 'rules'],
    ['no rules', { rules: [] }],
    ['rules not a list', { rules: {} }],
    ['too many rules', { rules: Array.from({ length: 11 }, () => ({ field: 'liked', op: 'is', value: true })) }],
    ['unknown field', { rules: [{ field: 'password', op: 'is', value: 'x' }] }],
    ['wrong op for field', { rules: [{ field: 'myPlays', op: 'contains', value: 1 }] }],
    ['text where a number goes', { rules: [{ field: 'myPlays', op: 'lt', value: '3; DROP TABLE tracks' }] }],
    ['fraction', { rules: [{ field: 'myPlays', op: 'lt', value: 1.5 }] }],
    ['negative days', { rules: [{ field: 'lastPlayed', op: 'olderThanDays', value: -1 }] }],
    ['liked needs a boolean', { rules: [{ field: 'liked', op: 'is', value: 'yes' }] }],
    ['empty genre', { rules: [{ field: 'genre', op: 'is', value: '  ' }] }],
    ['long artist', { rules: [{ field: 'artist', op: 'is', value: 'x'.repeat(101) }] }],
    ['bad match', { ...good, match: 'some' }],
    ['bad sort', { ...good, sort: 'id; DROP' }],
    ['limit 0', { ...good, limit: 0 }],
    ['limit 501', { ...good, limit: 501 }],
  ];
  for (const [name, input] of bad) {
    it(`refuses: ${name}`, () => {
      const out = checkRules(input);
      assert.ok('error' in out, name);
    });
  }
});
