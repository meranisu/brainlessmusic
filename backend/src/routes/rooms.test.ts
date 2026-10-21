import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';
import type { FastifyInstance } from 'fastify';
import type { WebSocket } from 'ws';
import { buildApp } from '../app.js';
import { setTrackFlags, upsertTrack } from '../db/library.js';
import { insertLibraryRoot } from '../db/libraryRoots.js';
import { insertGuest, insertUser, setAdminById, setPasswordHashById } from '../db/users.js';
import { signToken } from '../services/token.js';
import { resetDatabase } from '../testing/harness.js';
import { rooms } from './rooms.js';

/** The REST endpoints and the WebSocket. Room rules themselves are tested in `services/rooms.test.ts`. */

let app: FastifyInstance;
let aliceId: number;
let aliceToken: string;
let bobId: number;
let bobToken: string;
let guestToken: string;
let guestId: number;
let trackIds: number[];

before(async () => {
  app = buildApp();
  await app.ready();
});

after(async () => {
  rooms.reset();
  await app.close();
});

beforeEach(() => {
  rooms.reset();
  resetDatabase();

  const alice = insertUser('alice', 'hash');
  const bob = insertUser('bob', 'hash');
  const guest = insertGuest('Visitor');
  aliceId = alice.id;
  bobId = bob.id;
  aliceToken = signToken({ id: alice.id, username: alice.username });
  bobToken = signToken({ id: bob.id, username: bob.username });
  guestToken = signToken({ id: guest.id, username: guest.username });
  guestId = guest.id;

  const rootId = insertLibraryRoot('/library', null).id;
  trackIds = [1, 2, 3].map(
    (n) =>
      upsertTrack({
        path: `/library/${n}.mp3`,
        title: `Song ${n}`,
        artistName: 'Someone',
        albumTitle: null,
        albumYear: null,
        trackNumber: n,
        duration: 200,
        format: 'MP3',
        fileSize: 1000,
        rootId,
      }).id,
  );
});

function createRoom(token: string, payload: Record<string, unknown> = { trackIds, current: 0, positionMs: 0 }) {
  return app.inject({
    method: 'POST',
    url: '/api/rooms',
    headers: { authorization: `Bearer ${token}` },
    payload,
  });
}

type Message = { type: string; [key: string]: unknown };

/** A socket that buffers what it receives, so a test can wait for a message that already arrived. */
async function connect() {
  const ws: WebSocket = await app.injectWS('/api/rooms/ws');
  const inbox: Message[] = [];
  const waiters: { match: (m: Message) => boolean; resolve: (m: Message) => void }[] = [];
  ws.on('message', (data) => {
    const message = JSON.parse(data.toString()) as Message;
    const waiter = waiters.find((w) => w.match(message));
    if (waiter) {
      waiters.splice(waiters.indexOf(waiter), 1);
      waiter.resolve(message);
    } else {
      inbox.push(message);
    }
  });
  const closed = new Promise<number>((resolve) => ws.on('close', (code) => resolve(code)));

  function next(match: (m: Message) => boolean): Promise<Message> {
    const index = inbox.findIndex(match);
    if (index >= 0) return Promise.resolve(inbox.splice(index, 1)[0]);
    return new Promise((resolve, reject) => {
      waiters.push({ match, resolve });
      setTimeout(() => reject(new Error('timed out waiting for a message')), 2000);
    });
  }

  return {
    ws,
    closed,
    send: (m: object) => ws.send(JSON.stringify(m)),
    next,
    ofType: (type: string) => next((m) => m.type === type),
  };
}

async function join(token: string, code: string) {
  const socket = await connect();
  socket.send({ type: 'hello', token, code });
  const welcome = await socket.ofType('welcome');
  return { ...socket, welcome };
}

describe('rooms REST', () => {
  it('makes a room from the creator queue, and refuses bad input', async () => {
    const made = await createRoom(aliceToken);
    assert.equal(made.statusCode, 201);
    const { code } = made.json();
    assert.match(code, /^[A-Z]{6}$/);

    assert.equal((await createRoom(aliceToken, { trackIds: 'nope' })).statusCode, 400);
    assert.equal((await app.inject({ method: 'POST', url: '/api/rooms', payload: {} })).statusCode, 401);
  });

  it('refuses a hidden song', async () => {
    setTrackFlags([trackIds[1]], { hidden: true });
    assert.equal((await createRoom(aliceToken)).statusCode, 400);
  });

  it('shows the join screen who is there and what is on, and 404s an unknown code', async () => {
    const { code } = (await createRoom(aliceToken)).json();
    const res = await app.inject({
      method: 'GET',
      url: `/api/rooms/${code.toLowerCase()}`,
      headers: { authorization: `Bearer ${bobToken}` },
    });
    assert.deepEqual(res.json(), {
      code,
      members: ['alice'],
      nowPlaying: { title: 'Song 1', artist: 'Someone' },
    });

    const missing = await app.inject({
      method: 'GET',
      url: '/api/rooms/ZZZZZZ',
      headers: { authorization: `Bearer ${bobToken}` },
    });
    assert.equal(missing.statusCode, 404);
  });

  it('tells a client which room it is in', async () => {
    const { code } = (await createRoom(aliceToken)).json();
    const mine = (token: string) =>
      app.inject({ method: 'GET', url: '/api/rooms/mine', headers: { authorization: `Bearer ${token}` } });
    assert.deepEqual((await mine(aliceToken)).json(), { code });
    assert.deepEqual((await mine(bobToken)).json(), { code: null });
  });

  it('leaves over REST, for a Leave pressed while the socket is down', async () => {
    const { code } = (await createRoom(aliceToken)).json();
    const auth = { authorization: `Bearer ${aliceToken}` };
    const leave = () => app.inject({ method: 'POST', url: '/api/rooms/leave', headers: auth });
    assert.equal((await leave()).statusCode, 204);
    assert.deepEqual((await app.inject({ method: 'GET', url: '/api/rooms/mine', headers: auth })).json(), { code: null });
    // Alice was the only member, so the room went with her.
    const lookup = await app.inject({ method: 'GET', url: `/api/rooms/${code}`, headers: auth });
    assert.equal(lookup.statusCode, 404);
    // Not in a room: still fine.
    assert.equal((await leave()).statusCode, 204);
  });

  it('keeps the room list to admins', async () => {
    await createRoom(aliceToken);
    const list = () =>
      app.inject({ method: 'GET', url: '/api/admin/rooms', headers: { authorization: `Bearer ${aliceToken}` } });
    assert.equal((await list()).statusCode, 403);
    setAdminById(aliceId, true);
    const res = await list();
    assert.equal(res.statusCode, 200);
    assert.equal(res.json().rooms.length, 1);
  });
});

describe('rooms WebSocket', () => {
  it('refuses a bad token on hello', async () => {
    const { code } = (await createRoom(aliceToken)).json();
    const socket = await connect();
    socket.send({ type: 'hello', token: 'not-a-token', code });
    assert.equal((await socket.ofType('closed')).reason, 'unauthorized');
    assert.equal(await socket.closed, 4000);
  });

  it('closes a socket whose first message is not hello', async () => {
    const socket = await connect();
    socket.send({ type: 'ping', t0: 1 });
    assert.equal((await socket.ofType('closed')).reason, 'no-hello');
  });

  it('says not-found for an unknown room', async () => {
    const socket = await connect();
    socket.send({ type: 'hello', token: aliceToken, code: 'ZZZZZZ' });
    assert.equal((await socket.ofType('closed')).reason, 'not-found');
  });

  it('answers pings with the server clock', async () => {
    const { code } = (await createRoom(aliceToken)).json();
    const alice = await join(aliceToken, code);
    const before = Date.now();
    alice.send({ type: 'ping', t0: 42 });
    const pong = await alice.ofType('pong');
    assert.equal(pong.t0, 42);
    assert.ok((pong.ts as number) >= before);
    alice.ws.close();
  });

  it('keeps two members in step: one skips, both get the new state', async () => {
    const { code } = (await createRoom(aliceToken)).json();
    const alice = await join(aliceToken, code);
    const bob = await join(bobToken, code);
    const room = bob.welcome.room as { queue: { entryId: number }[]; members: unknown[] };
    assert.equal(room.members.length, 2);

    bob.send({ type: 'cmd', clientCmdId: 'b1', op: 'next', entryId: room.queue[0].entryId });
    const seen = await alice.next((m) => m.type === 'state' && (m.room as { current: number }).current === 1);
    assert.equal((seen.room as { current: number }).current, 1);

    // The same skip again names a song that is no longer current, so it is refused rather than skipping twice.
    bob.send({ type: 'cmd', clientCmdId: 'b2', op: 'next', entryId: room.queue[0].entryId });
    const rejected = await bob.ofType('rejected');
    assert.deepEqual([rejected.clientCmdId, rejected.reason], ['b2', 'stale']);
    alice.ws.close();
    bob.ws.close();
  });

  it('lets a guest join and skip (A100)', async () => {
    const { code } = (await createRoom(aliceToken)).json();
    const alice = await join(aliceToken, code);
    const guest = await join(guestToken, code);
    const room = guest.welcome.room as { members: { name: string; kind: string }[]; queue: { entryId: number }[] };
    assert.ok(room.members.some((m) => m.name === 'Visitor' && m.kind === 'guest'));
    guest.send({ type: 'cmd', clientCmdId: 'g1', op: 'next', entryId: room.queue[0].entryId });
    await alice.next((m) => m.type === 'state' && (m.room as { current: number }).current === 1);
    alice.ws.close();
    guest.ws.close();
  });

  it('marks a dropped member away, and they rejoin with the room as it is now', async () => {
    const { code } = (await createRoom(aliceToken)).json();
    const alice = await join(aliceToken, code);
    const bob = await join(bobToken, code);
    const firstEntry = (bob.welcome.room as { queue: { entryId: number }[] }).queue[0].entryId;

    bob.ws.terminate();
    await alice.next(
      (m) =>
        m.type === 'state' &&
        (m.room as { members: { userId: number; connected: boolean }[] }).members.some(
          (x) => x.userId === bobId && !x.connected,
        ),
    );
    alice.send({ type: 'cmd', clientCmdId: 'a1', op: 'next', entryId: firstEntry });
    await alice.next((m) => m.type === 'state' && (m.room as { current: number }).current === 1);

    const back = await join(bobToken, code);
    assert.equal((back.welcome.room as { current: number }).current, 1);
    alice.ws.close();
    back.ws.close();
  });

  it('ends the session when the password changed since the token was signed', async () => {
    const { code } = (await createRoom(aliceToken)).json();
    const alice = await join(aliceToken, code);
    const bob = await join(bobToken, code);
    setPasswordHashById(bobId, 'new-hash');
    bob.send({ type: 'cmd', clientCmdId: 'b1', op: 'pause' });
    assert.equal((await bob.ofType('closed')).reason, 'unauthorized');
    await alice.next(
      (m) =>
        m.type === 'state' && !(m.room as { members: { userId: number }[] }).members.some((x) => x.userId === bobId),
    );
    alice.ws.close();
  });

  it('the host ending the room closes everyone', async () => {
    const { code } = (await createRoom(aliceToken)).json();
    const alice = await join(aliceToken, code);
    const bob = await join(bobToken, code);
    alice.send({ type: 'cmd', clientCmdId: 'a1', op: 'end' });
    assert.equal((await bob.ofType('closed')).reason, 'ended');
    assert.equal((await alice.ofType('closed')).reason, 'ended');
    assert.equal(rooms.snapshot(code), undefined);
  });
});

describe('room invites (A255)', () => {
  const auth = (token: string) => ({ authorization: `Bearer ${token}` });

  it('invites an account, lists it for them, and drops it once they join', async () => {
    const { code } = (await createRoom(aliceToken)).json();
    const alice = await join(aliceToken, code);

    const invitable = await app.inject({ method: 'GET', url: '/api/rooms/invitable', headers: auth(aliceToken) });
    assert.deepEqual(
      invitable.json().people.map((p: { id: number }) => p.id),
      [bobId],
    );

    const sent = await app.inject({
      method: 'POST',
      url: '/api/rooms/invites',
      headers: auth(aliceToken),
      payload: { userIds: [bobId] },
    });
    assert.deepEqual(sent.json(), { invited: 1 });
    // Asking twice doesn't send a second one.
    const again = await app.inject({
      method: 'POST',
      url: '/api/rooms/invites',
      headers: auth(aliceToken),
      payload: { userIds: [bobId] },
    });
    assert.deepEqual(again.json(), { invited: 0 });

    const mine = (await app.inject({ method: 'GET', url: '/api/rooms/invites', headers: auth(bobToken) })).json();
    assert.equal(mine.invites.length, 1);
    assert.equal(mine.invites[0].code, code);
    assert.equal(mine.invites[0].from.id, aliceId);

    const bob = await join(bobToken, code);
    const after = (await app.inject({ method: 'GET', url: '/api/rooms/invites', headers: auth(bobToken) })).json();
    assert.deepEqual(after.invites, []);
    alice.ws.close();
    bob.ws.close();
  });

  it('refuses a sender outside a room, a guest as invitee, and a non-host when the host limits it', async () => {
    const outside = await app.inject({
      method: 'POST',
      url: '/api/rooms/invites',
      headers: auth(aliceToken),
      payload: { userIds: [bobId] },
    });
    assert.equal(outside.statusCode, 409);

    const { code } = (await createRoom(aliceToken)).json();
    const alice = await join(aliceToken, code);
    const toGuest = await app.inject({
      method: 'POST',
      url: '/api/rooms/invites',
      headers: auth(aliceToken),
      payload: { userIds: [guestId] },
    });
    assert.equal(toGuest.statusCode, 400);

    const bob = await join(bobToken, code);
    alice.send({ type: 'cmd', clientCmdId: 1, op: 'settings', settings: { invite: 'host' } });
    await bob.next((m) => m.type === 'state' && (m.room as { settings: { invite: string } }).settings.invite === 'host');
    const carol = insertUser('carol', 'hash');
    const limited = await app.inject({
      method: 'POST',
      url: '/api/rooms/invites',
      headers: auth(bobToken),
      payload: { userIds: [carol.id] },
    });
    assert.equal(limited.statusCode, 403);
    alice.ws.close();
    bob.ws.close();
  });

  it('a declined invite is gone', async () => {
    const { code } = (await createRoom(aliceToken)).json();
    const alice = await join(aliceToken, code);
    await app.inject({ method: 'POST', url: '/api/rooms/invites', headers: auth(aliceToken), payload: { userIds: [bobId] } });
    const declined = await app.inject({ method: 'DELETE', url: `/api/rooms/invites/${code}`, headers: auth(bobToken) });
    assert.equal(declined.statusCode, 204);
    const mine = (await app.inject({ method: 'GET', url: '/api/rooms/invites', headers: auth(bobToken) })).json();
    assert.deepEqual(mine.invites, []);
    alice.ws.close();
  });

  it("friends' now playing carries the room code of someone in a playing room", async () => {
    const { code } = (await createRoom(aliceToken, { trackIds, current: 0, positionMs: 0, playing: true })).json();
    const alice = await join(aliceToken, code);
    const listening = (await app.inject({ method: 'GET', url: '/api/social/now-playing', headers: auth(bobToken) })).json()
      .listening;
    assert.equal(listening.length, 1);
    assert.equal(listening[0].person.id, aliceId);
    assert.equal(listening[0].roomCode, code);
    alice.ws.close();
  });
});
