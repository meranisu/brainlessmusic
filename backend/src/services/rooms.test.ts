import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';
import {
  AWAY_GRACE_MS,
  type CloseReason,
  type Connection,
  MAX_MEMBERS,
  type RoomRegistry,
  type RoomSnapshot,
  type RoomTrack,
  SONG_LEAD_MS,
  createRoomRegistry,
  votesNeeded,
} from './rooms.js';

/** The registry alone, with a fake clock: song timing, conflicts, reconnects and lifetimes. Sockets: `routes/rooms.test.ts`. */

function fakeClock() {
  let t = 1_000_000;
  const timers = new Set<{ at: number; fn: () => void }>();
  return {
    now: () => t,
    setTimer(fn: () => void, ms: number) {
      const handle = { at: t + ms, fn };
      timers.add(handle);
      return handle;
    },
    clearTimer(handle: unknown) {
      timers.delete(handle as { at: number; fn: () => void });
    },
    advance(ms: number) {
      const end = t + ms;
      for (;;) {
        const due = [...timers].filter((x) => x.at <= end).sort((a, b) => a.at - b.at)[0];
        if (!due) break;
        timers.delete(due);
        t = due.at;
        due.fn();
      }
      t = end;
    },
  };
}

/** Tracks 1–9 are 100 s long; 99 is unplayable. */
function lookupTracks(ids: number[]): Map<number, RoomTrack> {
  const found = new Map<number, RoomTrack>();
  for (const id of ids) {
    if (id < 10) found.set(id, { trackId: id, title: `T${id}`, artist: 'A', album: null, albumId: null, durationMs: 100_000, gainDb: null });
  }
  return found;
}

function fakeSocket() {
  const sent: { type: string; room?: RoomSnapshot }[] = [];
  const closed: CloseReason[] = [];
  const connection: Connection = {
    send: (m) => sent.push(m as (typeof sent)[number]),
    close: (reason) => closed.push(reason),
  };
  return { connection, sent, closed, last: () => sent.at(-1)?.room };
}

const alice = { userId: 1, name: 'alice', kind: 'account' as const };
const bob = { userId: 2, name: 'bob', kind: 'account' as const };
const guest = { userId: 3, name: 'Guest', kind: 'guest' as const };

let clock: ReturnType<typeof fakeClock>;
let rooms: RoomRegistry;

beforeEach(() => {
  clock = fakeClock();
  rooms = createRoomRegistry({ ...clock, lookupTracks });
});

function makeRoom(trackIds = [1, 2, 3], playing = false) {
  const result = rooms.create(alice, { trackIds, current: 0, positionMs: 0, playing });
  assert.ok(result.ok);
  return result.code;
}

function entry(code: string, index: number): number {
  return rooms.snapshot(code)!.queue[index].entryId;
}

describe('room registry: making and joining', () => {
  it('makes a 6-letter code with no look-alike characters, from the creator queue', () => {
    const code = makeRoom();
    assert.match(code, /^[A-HJ-NP-Z]{6}$/);
    const room = rooms.snapshot(code)!;
    assert.deepEqual(
      room.queue.map((e) => e.trackId),
      [1, 2, 3],
    );
    assert.equal(room.hostUserId, alice.userId);
    assert.equal(room.members[0].connected, false);
  });

  it('refuses an unplayable song and leaves the creator in their old room', () => {
    const first = makeRoom();
    const result = rooms.create(alice, { trackIds: [1, 99], current: 0, positionMs: 0, playing: false });
    assert.equal(result.ok, false);
    assert.equal(rooms.codeOfUser(alice.userId), first);
  });

  it('finds a room whatever the case of the typed code', () => {
    const code = makeRoom();
    assert.ok(rooms.connect(code.toLowerCase(), bob, fakeSocket().connection).ok);
  });

  it('turns away the ninth person', () => {
    const code = makeRoom();
    for (let id = 10; id < 10 + MAX_MEMBERS - 1; id++) {
      assert.ok(rooms.connect(code, { userId: id, name: `u${id}`, kind: 'account' }, fakeSocket().connection).ok);
    }
    const result = rooms.connect(code, bob, fakeSocket().connection);
    assert.deepEqual(result, { ok: false, reason: 'full' });
  });

  it('a second device takes over, and the old socket closing later changes nothing', () => {
    const code = makeRoom();
    const phone = fakeSocket();
    const laptop = fakeSocket();
    rooms.connect(code, bob, phone.connection);
    rooms.connect(code, bob, laptop.connection);
    assert.deepEqual(phone.closed, ['replaced']);
    rooms.disconnect(code, bob.userId, phone.connection);
    assert.equal(rooms.snapshot(code)!.members.find((m) => m.userId === bob.userId)!.connected, true);
  });

  it("shows each member's picture, and a reconnect picks up a new one", () => {
    const code = makeRoom();
    assert.equal(rooms.snapshot(code)!.members[0].avatarId, null);
    const socket = fakeSocket();
    rooms.connect(code, { ...bob, avatarId: 'a'.repeat(64) }, socket.connection);
    const bobOf = () => rooms.snapshot(code)!.members.find((m) => m.userId === bob.userId)!;
    assert.equal(bobOf().avatarId, 'a'.repeat(64));
    rooms.connect(code, { ...bob, avatarId: null }, fakeSocket().connection);
    assert.equal(bobOf().avatarId, null);
  });

  it('joining another room leaves the first', () => {
    const first = makeRoom();
    const socket = fakeSocket();
    rooms.connect(first, bob, socket.connection);
    const second = rooms.create(guest, { trackIds: [], current: 0, positionMs: 0, playing: false });
    assert.ok(second.ok);
    rooms.connect(second.code, bob, fakeSocket().connection);
    assert.deepEqual(socket.closed, ['replaced']);
    assert.equal(rooms.codeOfUser(bob.userId), second.code);
    assert.equal(
      rooms.snapshot(first)!.members.some((m) => m.userId === bob.userId),
      false,
    );
  });

  it('lets a guest join and use the controls (A100)', () => {
    const code = makeRoom();
    rooms.connect(code, guest, fakeSocket().connection);
    assert.deepEqual(rooms.command(code, guest.userId, { op: 'play' }), { ok: true });
  });
});

describe('room registry: playback', () => {
  it('starts a new song after the load lead, and the server moves to the next when it ends', () => {
    const code = makeRoom([1, 2], true);
    const start = rooms.snapshot(code)!.playback;
    assert.equal(start.anchorMs, clock.now() + SONG_LEAD_MS);

    clock.advance(SONG_LEAD_MS + 100_000 - 1);
    assert.equal(rooms.snapshot(code)!.current, 0);
    clock.advance(1);
    const room = rooms.snapshot(code)!;
    assert.equal(room.current, 1);
    assert.equal(room.playback.playing, true);
  });

  it('pauses at the end of the last song instead of looping', () => {
    const code = makeRoom([1], true);
    clock.advance(SONG_LEAD_MS + 100_000);
    const { playback, current } = rooms.snapshot(code)!;
    assert.equal(current, 0);
    assert.deepEqual([playback.playing, playback.positionMs], [false, 100_000]);
  });

  it('pause keeps the position, and play resumes from it', () => {
    const code = makeRoom([1], true);
    clock.advance(SONG_LEAD_MS + 10_000);
    rooms.command(code, alice.userId, { op: 'pause' });
    assert.equal(rooms.snapshot(code)!.playback.positionMs, 10_000);
    clock.advance(60_000);
    rooms.command(code, alice.userId, { op: 'play' });
    assert.equal(rooms.snapshot(code)!.playback.positionMs, 10_000);
  });

  it('pausing stops the song timer, so a paused room never skips', () => {
    const code = makeRoom([1, 2], true);
    rooms.connect(code, alice, fakeSocket().connection);
    rooms.command(code, alice.userId, { op: 'pause' });
    clock.advance(500_000);
    assert.equal(rooms.snapshot(code)!.current, 0);
  });

  it('two skips pressed at once move one song, not two', () => {
    const code = roomWith([alice, bob]);
    const seen = entry(code, 0);
    assert.deepEqual(rooms.command(code, alice.userId, { op: 'next', entryId: seen }), { ok: true });
    assert.deepEqual(rooms.command(code, bob.userId, { op: 'next', entryId: seen }), { ok: false, reason: 'stale' });
    assert.equal(rooms.snapshot(code)!.current, 1);
  });

  it('previous restarts the song after 3 s, and goes back one before that', () => {
    const code = makeRoom([1, 2], true);
    rooms.connect(code, alice, fakeSocket().connection);
    rooms.command(code, alice.userId, { op: 'next', entryId: entry(code, 0) });
    clock.advance(SONG_LEAD_MS + 5000);
    rooms.command(code, alice.userId, { op: 'previous', entryId: entry(code, 1) });
    assert.equal(rooms.snapshot(code)!.current, 1);
    rooms.command(code, alice.userId, { op: 'previous', entryId: entry(code, 1) });
    assert.equal(rooms.snapshot(code)!.current, 0);
  });

  it('a seek reschedules the end of the song', () => {
    const code = makeRoom([1, 2], true);
    clock.advance(SONG_LEAD_MS);
    rooms.command(code, alice.userId, { op: 'seek', entryId: entry(code, 0), positionMs: 95_000 });
    clock.advance(6000);
    assert.equal(rooms.snapshot(code)!.current, 1);
  });
});

describe('room registry: the queue', () => {
  it('adding before the playing song keeps the same song playing', () => {
    const code = makeRoom([1, 2]);
    rooms.connect(code, alice, fakeSocket().connection);
    rooms.command(code, alice.userId, { op: 'next', entryId: entry(code, 0) });
    rooms.command(code, alice.userId, { op: 'add', trackIds: [5, 6], after: entry(code, 0) });
    const room = rooms.snapshot(code)!;
    assert.deepEqual(
      room.queue.map((e) => e.trackId),
      [1, 5, 6, 2],
    );
    assert.equal(room.queue[room.current].trackId, 2);
  });

  it('gives two copies of one song different entry ids', () => {
    const code = makeRoom([1]);
    rooms.command(code, alice.userId, { op: 'add', trackIds: [1] });
    const [a, b] = rooms.snapshot(code)!.queue;
    assert.notEqual(a.entryId, b.entryId);
  });

  it('refuses an unplayable song without adding any of the batch', () => {
    const code = makeRoom([1]);
    assert.deepEqual(rooms.command(code, alice.userId, { op: 'add', trackIds: [2, 99] }), {
      ok: false,
      reason: 'unplayable',
    });
    assert.equal(rooms.snapshot(code)!.queue.length, 1);
  });

  it('removing the playing song starts the one after it; removing the last stops at the end', () => {
    const code = makeRoom([1, 2], true);
    rooms.command(code, alice.userId, { op: 'remove', entryId: entry(code, 0) });
    let room = rooms.snapshot(code)!;
    assert.deepEqual([room.queue[room.current].trackId, room.playback.playing], [2, true]);

    rooms.command(code, alice.userId, { op: 'remove', entryId: entry(code, 0) });
    room = rooms.snapshot(code)!;
    assert.deepEqual([room.current, room.queue.length, room.playback.playing], [-1, 0, false]);
  });

  it('a song added to an empty room becomes current, paused', () => {
    const result = rooms.create(alice, { trackIds: [], current: 0, positionMs: 0, playing: false });
    assert.ok(result.ok);
    rooms.command(result.code, alice.userId, { op: 'add', trackIds: [4] });
    const room = rooms.snapshot(result.code)!;
    assert.deepEqual([room.current, room.playback.playing], [0, false]);
  });

  it('moving songs keeps the playing one current', () => {
    const code = makeRoom([1, 2, 3]);
    rooms.command(code, alice.userId, { op: 'move', entryId: entry(code, 0), toIndex: 2 });
    const room = rooms.snapshot(code)!;
    assert.deepEqual(
      room.queue.map((e) => e.trackId),
      [2, 3, 1],
    );
    assert.equal(room.queue[room.current].trackId, 1);
  });
});

describe('room registry: host, dropouts and lifetimes', () => {
  it('only the host ends the room or removes people (A101)', () => {
    const code = makeRoom();
    const bobSocket = fakeSocket();
    rooms.connect(code, bob, bobSocket.connection);
    assert.deepEqual(rooms.command(code, bob.userId, { op: 'end' }), { ok: false, reason: 'host-only' });
    assert.deepEqual(rooms.command(code, bob.userId, { op: 'kick', userId: alice.userId }), {
      ok: false,
      reason: 'host-only',
    });
    assert.deepEqual(rooms.command(code, alice.userId, { op: 'kick', userId: bob.userId }), { ok: true });
    assert.deepEqual(bobSocket.closed, ['kicked']);
    assert.deepEqual(rooms.command(code, alice.userId, { op: 'end' }), { ok: true });
    assert.equal(rooms.snapshot(code), undefined);
  });

  it('removing someone sends everyone one state, not two', () => {
    const code = makeRoom();
    const aliceSocket = fakeSocket();
    rooms.connect(code, alice, aliceSocket.connection);
    rooms.connect(code, bob, fakeSocket().connection);
    const before = aliceSocket.sent.length;
    const version = rooms.snapshot(code)!.version;
    assert.deepEqual(rooms.command(code, alice.userId, { op: 'kick', userId: bob.userId }), { ok: true });
    assert.equal(aliceSocket.sent.length - before, 1);
    assert.equal(rooms.snapshot(code)!.version, version + 1);
  });

  it('hands the host role to the longest-present member when the host leaves', () => {
    const code = makeRoom();
    rooms.connect(code, alice, fakeSocket().connection);
    rooms.connect(code, bob, fakeSocket().connection);
    rooms.connect(code, guest, fakeSocket().connection);
    rooms.leave(code, alice.userId);
    assert.equal(rooms.snapshot(code)!.hostUserId, bob.userId);
  });

  it('keeps a dropped member as away for the grace period, then removes them', () => {
    const code = makeRoom();
    rooms.connect(code, alice, fakeSocket().connection);
    const bobSocket = fakeSocket();
    rooms.connect(code, bob, bobSocket.connection);

    rooms.disconnect(code, bob.userId, bobSocket.connection);
    const away = rooms.snapshot(code)!.members.find((m) => m.userId === bob.userId)!;
    assert.equal(away.connected, false);

    clock.advance(AWAY_GRACE_MS - 1);
    assert.ok(rooms.snapshot(code)!.members.some((m) => m.userId === bob.userId));
    clock.advance(1);
    assert.equal(
      rooms.snapshot(code)!.members.some((m) => m.userId === bob.userId),
      false,
    );
  });

  it('a member back within the grace period stays, with the room as it is now (the 30-second test)', () => {
    const code = makeRoom([1, 2], true);
    rooms.connect(code, alice, fakeSocket().connection);
    const bobPhone = fakeSocket();
    rooms.connect(code, bob, bobPhone.connection);

    rooms.disconnect(code, bob.userId, bobPhone.connection);
    clock.advance(10_000);
    rooms.command(code, alice.userId, { op: 'next', entryId: entry(code, 0) });
    clock.advance(20_000);

    const back = rooms.connect(code, bob, fakeSocket().connection);
    assert.ok(back.ok);
    assert.equal(back.room.current, 1);
    clock.advance(AWAY_GRACE_MS);
    assert.ok(rooms.snapshot(code)!.members.some((m) => m.userId === bob.userId));
  });

  it('a room nobody opens disappears after the grace period', () => {
    const code = makeRoom();
    clock.advance(AWAY_GRACE_MS);
    assert.equal(rooms.snapshot(code), undefined);
    assert.equal(rooms.codeOfUser(alice.userId), undefined);
  });

  it('a newcomer gets no broadcast of their own arrival: their welcome carries it', () => {
    const code = makeRoom();
    const a = fakeSocket();
    rooms.connect(code, alice, a.connection);
    const b = fakeSocket();
    rooms.connect(code, bob, b.connection);
    assert.equal(b.sent.length, 0);
    assert.equal(a.last()!.members.length, 2);
  });

  it('tells every connected member about each change', () => {
    const code = makeRoom();
    const a = fakeSocket();
    const b = fakeSocket();
    rooms.connect(code, alice, a.connection);
    rooms.connect(code, bob, b.connection);
    rooms.command(code, bob.userId, { op: 'play' });
    assert.equal(a.last()!.playback.playing, true);
    assert.equal(b.last()!.version, a.last()!.version);
  });
});

const carol = { userId: 4, name: 'carol', kind: 'account' as const };
const dave = { userId: 5, name: 'dave', kind: 'account' as const };

/** A room made by alice, with everyone in `people` connected. */
function roomWith(people: (typeof alice)[], trackIds = [1, 2, 3], playing = true) {
  const code = makeRoom(trackIds, playing);
  for (const person of people) rooms.connect(code, person, fakeSocket().connection);
  return code;
}

function trackOrder(code: string): number[] {
  return rooms.snapshot(code)!.queue.map((e) => e.trackId);
}

describe('room registry: host settings (A253)', () => {
  it('starts with vote to skip, host-only invites (A258), and everything else open to everyone', () => {
    const code = roomWith([alice]);
    assert.deepEqual(rooms.snapshot(code)!.settings, {
      shuffle: false,
      repeat: 'off',
      turns: false,
      skip: 'vote',
      playback: 'everyone',
      add: 'everyone',
      editQueue: 'everyone',
      invite: 'host',
    });
  });

  it('only the host changes settings, and only to known values', () => {
    const code = roomWith([alice, bob]);
    assert.deepEqual(rooms.command(code, bob.userId, { op: 'settings', settings: { repeat: 'all' } }), {
      ok: false,
      reason: 'host-only',
    });
    for (const settings of [{}, { repeat: 'twice' }, { volume: 3 }, null]) {
      const result = rooms.command(code, alice.userId, { op: 'settings', settings: settings as never });
      assert.deepEqual(result, { ok: false, reason: 'bad-settings' });
    }
    assert.deepEqual(rooms.command(code, alice.userId, { op: 'settings', settings: { repeat: 'all' } }), { ok: true });
    assert.equal(rooms.snapshot(code)!.settings.repeat, 'all');
  });

  it('host-only playback, adding and queue edits hold back everyone but the host', () => {
    const code = roomWith([alice, bob]);
    rooms.command(code, alice.userId, { op: 'settings', settings: { playback: 'host', add: 'host', editQueue: 'host' } });
    const notAllowed = { ok: false, reason: 'not-allowed' };
    assert.deepEqual(rooms.command(code, bob.userId, { op: 'pause' }), notAllowed);
    assert.deepEqual(rooms.command(code, bob.userId, { op: 'add', trackIds: [5] }), notAllowed);
    assert.deepEqual(rooms.command(code, bob.userId, { op: 'remove', entryId: entry(code, 2) }), notAllowed);
    assert.deepEqual(rooms.command(code, alice.userId, { op: 'pause' }), { ok: true });
    assert.deepEqual(rooms.command(code, alice.userId, { op: 'add', trackIds: [5] }), { ok: true });
  });

  it('with queue edits host-only, you can still remove your own songs', () => {
    const code = roomWith([alice, bob]);
    rooms.command(code, bob.userId, { op: 'add', trackIds: [5] });
    rooms.command(code, alice.userId, { op: 'settings', settings: { editQueue: 'host' } });
    assert.deepEqual(rooms.command(code, bob.userId, { op: 'remove', entryId: entry(code, 3) }), { ok: true });
  });

  it('repeat one plays the song again; repeat all goes round to the first', () => {
    const code = roomWith([alice], [1, 2]);
    rooms.command(code, alice.userId, { op: 'settings', settings: { repeat: 'one' } });
    clock.advance(SONG_LEAD_MS + 100_000);
    assert.equal(rooms.snapshot(code)!.current, 0);
    assert.equal(rooms.snapshot(code)!.playback.playing, true);

    rooms.command(code, alice.userId, { op: 'settings', settings: { repeat: 'all' } });
    rooms.command(code, alice.userId, { op: 'next', entryId: entry(code, 0) });
    assert.deepEqual(rooms.command(code, alice.userId, { op: 'next', entryId: entry(code, 1) }), { ok: true });
    assert.equal(rooms.snapshot(code)!.current, 0);
  });

  it('shuffle reorders only the songs still to come, and new songs land among them', () => {
    let seed = 0.37;
    rooms = createRoomRegistry({ ...clock, lookupTracks, random: () => (seed = (seed * 9301 + 0.49297) % 1) });
    const code = roomWith([alice], [1, 2, 3, 4, 5, 6]);
    rooms.command(code, alice.userId, { op: 'settings', settings: { shuffle: true } });
    const order = trackOrder(code);
    assert.equal(order[0], 1);
    assert.deepEqual([...order].sort(), [1, 2, 3, 4, 5, 6]);
    assert.notDeepEqual(order, [1, 2, 3, 4, 5, 6]);

    rooms.command(code, alice.userId, { op: 'add', trackIds: [7] });
    assert.equal(trackOrder(code)[0], 1);
    assert.equal(trackOrder(code).length, 7);
  });

  it('take turns plays one song from each person in rotation', () => {
    const code = roomWith([alice, bob, carol], [1, 2, 3]);
    rooms.command(code, bob.userId, { op: 'add', trackIds: [4, 5] });
    rooms.command(code, carol.userId, { op: 'add', trackIds: [6] });
    rooms.command(code, alice.userId, { op: 'settings', settings: { turns: true } });
    // Alice's 1 is playing, so bob is next, then carol, then back to alice.
    assert.deepEqual(trackOrder(code), [1, 4, 6, 2, 5, 3]);
    assert.deepEqual(rooms.command(code, alice.userId, { op: 'move', entryId: entry(code, 2), toIndex: 1 }), {
      ok: false,
      reason: 'turns-on',
    });
  });

  it('every queue entry carries who added it', () => {
    const code = roomWith([alice, { ...bob, avatarId: 'pic' } as typeof alice]);
    rooms.command(code, bob.userId, { op: 'add', trackIds: [5] });
    const added = rooms.snapshot(code)!.queue[3];
    assert.equal(added.addedByName, 'bob');
    assert.equal(added.addedByAvatarId, 'pic');
    rooms.leave(code, bob.userId);
    assert.equal(rooms.snapshot(code)!.queue[3].addedByName, 'bob');
  });
});

describe('room registry: vote to skip (A254, A263)', () => {
  it('needs more than half, but one vote with two people', () => {
    assert.deepEqual([1, 2, 3, 4, 5, 8].map(votesNeeded), [1, 1, 2, 3, 3, 5]);
  });

  it("the song's adder skips at once", () => {
    const code = roomWith([alice, bob, carol]);
    rooms.command(code, bob.userId, { op: 'add', trackIds: [5], after: entry(code, 0) });
    rooms.command(code, alice.userId, { op: 'next', entryId: entry(code, 0) });
    rooms.command(code, carol.userId, { op: 'next', entryId: entry(code, 0) });
    assert.equal(rooms.snapshot(code)!.queue[rooms.snapshot(code)!.current].trackId, 5);
    rooms.command(code, bob.userId, { op: 'next', entryId: entry(code, 1) });
    assert.equal(rooms.snapshot(code)!.current, 2);
  });

  it("the host's Next is a vote too, even on the songs the room started with (A263)", () => {
    const code = roomWith([alice, bob, carol]);
    assert.deepEqual(rooms.command(code, alice.userId, { op: 'next', entryId: entry(code, 0) }), { ok: true });
    let room = rooms.snapshot(code)!;
    assert.equal(room.current, 0);
    assert.deepEqual(room.skipVote, { entryId: entry(code, 0), votes: [alice.userId], needed: 2 });
    const votedOn = entry(code, 0);
    rooms.command(code, bob.userId, { op: 'next', entryId: votedOn });
    room = rooms.snapshot(code)!;
    assert.equal(room.current, 1);
    assert.equal(room.votedOff, votedOn);
  });

  it("the host's own added song still skips at once", () => {
    const code = roomWith([alice, bob, carol]);
    rooms.command(code, alice.userId, { op: 'add', trackIds: [5], after: entry(code, 0) });
    rooms.command(code, bob.userId, { op: 'next', entryId: entry(code, 0) });
    rooms.command(code, carol.userId, { op: 'next', entryId: entry(code, 0) });
    assert.equal(rooms.snapshot(code)!.queue[rooms.snapshot(code)!.current].trackId, 5);
    rooms.command(code, alice.userId, { op: 'next', entryId: entry(code, 1) });
    assert.equal(rooms.snapshot(code)!.current, 2);
  });

  it('marks the starting queue as the room\'s songs', () => {
    const code = roomWith([alice, bob]);
    assert.ok(rooms.snapshot(code)!.queue.every((song) => song.seed === true));
  });

  it('with three people, one vote waits and a second one skips', () => {
    const code = roomWith([alice, bob, carol]);
    rooms.command(code, bob.userId, { op: 'next', entryId: entry(code, 0) });
    let room = rooms.snapshot(code)!;
    assert.equal(room.current, 0);
    assert.deepEqual(room.skipVote, { entryId: entry(code, 0), votes: [bob.userId], needed: 2 });
    rooms.command(code, carol.userId, { op: 'next', entryId: entry(code, 0) });
    room = rooms.snapshot(code)!;
    assert.equal(room.current, 1);
    assert.equal(room.skipVote, null);
  });

  it('with two people, one vote skips', () => {
    const code = roomWith([alice, bob]);
    rooms.command(code, bob.userId, { op: 'next', entryId: entry(code, 0) });
    assert.equal(rooms.snapshot(code)!.current, 1);
  });

  it('someone dropping out can be enough for the votes already in', () => {
    const code = makeRoom([1, 2, 3], true);
    for (const person of [alice, bob, carol]) rooms.connect(code, person, fakeSocket().connection);
    const daveSocket = fakeSocket();
    rooms.connect(code, dave, daveSocket.connection);
    rooms.command(code, bob.userId, { op: 'next', entryId: entry(code, 0) });
    rooms.command(code, carol.userId, { op: 'next', entryId: entry(code, 0) });
    assert.equal(rooms.snapshot(code)!.current, 0);
    rooms.disconnect(code, dave.userId, daveSocket.connection);
    assert.equal(rooms.snapshot(code)!.current, 1);
  });

  it('skip set to host-only refuses everyone else', () => {
    const code = roomWith([alice, bob]);
    rooms.command(code, alice.userId, { op: 'settings', settings: { skip: 'host' } });
    assert.deepEqual(rooms.command(code, bob.userId, { op: 'next', entryId: entry(code, 0) }), {
      ok: false,
      reason: 'not-allowed',
    });

    rooms.command(code, alice.userId, { op: 'next', entryId: entry(code, 0) });
    assert.equal(rooms.snapshot(code)!.current, 1);
  });
});
