import type { FastifyPluginAsync } from 'fastify';
import type { WebSocket } from 'ws';
import { getTrackSummariesByIds } from '../db/browse.js';
import { type UserRow, findUserById, nameOf } from '../db/users.js';
import {
  type Command,
  type Connection,
  type MemberInfo,
  type RoomTrack,
  createRoomRegistry,
} from '../services/rooms.js';
import { verifySessionToken } from '../services/token.js';

/**
 * Room sync (spec: `.docs/specs/room-sync.md`). REST for things that happen once, one WebSocket for the live part.
 * Guests may join with full controls (A100); everyone controls, the host ends the room (A101).
 */

/** A browser can't put headers on a WebSocket and a URL token ends up in logs, so the first message carries it. */
const HELLO_TIMEOUT_MS = 5000;
/** Protocol pings catch a phone that vanished without closing its socket, well inside Cloudflare's ~100 s limit. */
const HEARTBEAT_MS = 30_000;

export const rooms = createRoomRegistry({
  now: () => Date.now(),
  // Unref'd: the HTTP server keeps the process alive, and a room timer alone shouldn't (tests exit on time).
  setTimer: (fn, ms) => setTimeout(fn, ms).unref(),
  clearTimer: (handle) => clearTimeout(handle as NodeJS.Timeout | undefined),
  lookupTracks(ids) {
    const playable = new Map<number, RoomTrack>();
    for (const t of getTrackSummariesByIds([...new Set(ids)])) {
      // Hidden tracks don't exist for a non-admin (A34), and the server can't end a song of unknown length.
      if (t.hidden || t.missing || !t.duration || t.duration <= 0) continue;
      playable.set(t.id, {
        trackId: t.id,
        title: t.title,
        artist: t.artist,
        albumId: t.albumId,
        durationMs: Math.round(t.duration * 1000),
      });
    }
    return playable;
  },
});

/** The same check `authenticate` makes, including a password changed since the token was signed (C8). */
function memberFromToken(token: unknown): MemberInfo | undefined {
  if (typeof token !== 'string') return undefined;
  try {
    const claims = verifySessionToken(token);
    const user = findUserById(claims.id);
    if (!user || user.session_version !== (claims.sessionVersion ?? 0)) return undefined;
    return memberInfo(user);
  } catch {
    return undefined;
  }
}

function memberInfo(user: UserRow): MemberInfo {
  return { userId: user.id, name: nameOf(user), kind: user.kind === 'guest' ? 'guest' : 'account' };
}

function stillValid(userId: number, sessionVersion: number): boolean {
  const user = findUserById(userId);
  return !!user && user.session_version === sessionVersion;
}

interface CreateBody {
  trackIds?: unknown;
  current?: unknown;
  positionMs?: unknown;
  playing?: unknown;
}

const roomsRoute: FastifyPluginAsync = async (fastify) => {
  // Starts from the creator's queue and position (spec, Scope 1). An empty queue is a valid room.
  fastify.post<{ Body: CreateBody }>('/rooms', { preHandler: fastify.authenticate }, async (request, reply) => {
    const { trackIds = [], current = 0, positionMs = 0, playing = false } = request.body ?? {};
    if (!Array.isArray(trackIds) || !trackIds.every((id) => Number.isInteger(id) && id > 0)) {
      return reply.code(400).send({ error: 'trackIds must be an array of positive integer track ids' });
    }
    if (!Number.isInteger(current) || (current as number) < 0) {
      return reply.code(400).send({ error: 'current must be a non-negative integer' });
    }
    if (typeof positionMs !== 'number' || !Number.isFinite(positionMs) || positionMs < 0) {
      return reply.code(400).send({ error: 'positionMs must be a non-negative number' });
    }
    if (typeof playing !== 'boolean') return reply.code(400).send({ error: 'playing must be a boolean' });

    const user = findUserById(request.user!.id)!;
    const result = rooms.create(
      memberInfo(user),
      { trackIds: trackIds as number[], current: current as number, positionMs, playing },
    );
    if (!result.ok) return reply.code(400).send({ error: result.reason });
    return reply.code(201).send({ code: result.code });
  });

  // So a client that restarts knows whether it was in a room.
  fastify.get('/rooms/mine', { preHandler: fastify.authenticate }, async (request) => ({
    code: rooms.codeOfUser(request.user!.id) ?? null,
  }));

  // For the join screen: who's there and what's on, before connecting.
  fastify.get<{ Params: { code: string } }>(
    '/rooms/:code',
    { preHandler: fastify.authenticate },
    async (request, reply) => {
      const room = rooms.snapshot(request.params.code);
      if (!room) return reply.code(404).send({ error: 'No room with that code' });
      const playing = room.queue[room.current];
      return {
        code: room.code,
        members: room.members.map((m) => m.name),
        nowPlaying: playing ? { title: playing.title, artist: playing.artist } : null,
      };
    },
  );

  fastify.get('/admin/rooms', { preHandler: [fastify.authenticate, fastify.requireAdmin] }, async () => ({
    serverNow: rooms.now(),
    rooms: rooms.overview(),
  }));

  fastify.get('/rooms/ws', { websocket: true }, (socket: WebSocket) => {
    let joined: { code: string; userId: number; sessionVersion: number; connection: Connection } | null = null;

    const send = (message: object) => {
      if (socket.readyState === socket.OPEN) socket.send(JSON.stringify(message));
    };
    const closeWith = (reason: string) => {
      send({ type: 'closed', reason });
      socket.close(4000, reason);
    };

    const helloTimer = setTimeout(() => closeWith('no-hello'), HELLO_TIMEOUT_MS);

    let alive = true;
    socket.on('pong', () => {
      alive = true;
    });
    const heartbeat = setInterval(() => {
      if (!alive) {
        socket.terminate();
        return;
      }
      alive = false;
      socket.ping();
    }, HEARTBEAT_MS);

    socket.on('close', () => {
      clearTimeout(helloTimer);
      clearInterval(heartbeat);
      if (joined) rooms.disconnect(joined.code, joined.userId, joined.connection);
    });

    socket.on('message', (data) => {
      let message: Record<string, unknown>;
      try {
        message = JSON.parse(data.toString());
        if (typeof message !== 'object' || message === null) throw new Error('not an object');
      } catch {
        send({ type: 'error', reason: 'bad-json' });
        return;
      }

      if (!joined) {
        if (message.type !== 'hello' || typeof message.code !== 'string') {
          closeWith('no-hello');
          return;
        }
        const member = memberFromToken(message.token);
        if (!member) {
          closeWith('unauthorized');
          return;
        }
        clearTimeout(helloTimer);
        const connection: Connection = {
          send,
          close: (reason) => {
            joined = null;
            closeWith(reason);
          },
        };
        const result = rooms.connect(message.code, member, connection);
        if (!result.ok) {
          closeWith(result.reason);
          return;
        }
        const sessionVersion = findUserById(member.userId)!.session_version;
        joined = { code: result.room.code, userId: member.userId, sessionVersion, connection };
        send({ type: 'welcome', room: result.room, you: member.userId, serverNow: rooms.now() });
        return;
      }

      switch (message.type) {
        case 'ping':
          send({ type: 'pong', t0: message.t0, ts: rooms.now() });
          return;
        case 'cmd': {
          // A deleted user or changed password ends the session here too, not just on the next REST call.
          if (!stillValid(joined.userId, joined.sessionVersion)) {
            const { code, userId } = joined;
            joined = null;
            closeWith('unauthorized');
            rooms.leave(code, userId);
            return;
          }
          const { clientCmdId, type: _type, ...cmd } = message;
          const result = rooms.command(joined.code, joined.userId, cmd as unknown as Command);
          if (!result.ok) send({ type: 'rejected', clientCmdId, reason: result.reason });
          return;
        }
        case 'status': {
          const drift = typeof message.driftMs === 'number' && Number.isFinite(message.driftMs) ? message.driftMs : null;
          rooms.status(joined.code, joined.userId, drift, message.buffering === true);
          return;
        }
        case 'leave':
          rooms.leave(joined.code, joined.userId);
          return;
        default:
          send({ type: 'error', reason: 'unknown-type' });
      }
    });
  });
};

export default roomsRoute;
