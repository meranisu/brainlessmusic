import type { FastifyPluginAsync } from 'fastify';
import type { WebSocket } from 'ws';
import { getTrackSummariesByIds } from '../db/browse.js';
import { ROOM_ISSUE_KINDS, type RoomIssueKind, recordRoomIssue } from '../db/roomIssues.js';
import { invitablePeople } from '../db/social.js';
import { type UserRow, findUserById, nameOf } from '../db/users.js';
import {
  type Command,
  type Connection,
  MAX_INVITES_PER_CALL,
  type MemberInfo,
  type RoomTrack,
  createRoomRegistry,
} from '../services/rooms.js';
import { createRateLimiter } from '../services/rateLimit.js';
import { verifySessionToken } from '../services/token.js';
import { clientIp } from '../utils/clientIp.js';
import { replyRateLimited } from '../utils/replyRateLimited.js';

/**
 * Room sync (spec: `.docs/specs/room-sync.md`). REST for things that happen once, one WebSocket for the live part.
 * Guests may join with full controls (A100); everyone controls, the host ends the room (A101).
 */

/** A browser can't put headers on a WebSocket and a URL token ends up in logs, so the first message carries it. */
const HELLO_TIMEOUT_MS = 5000;

// Room codes are 6 letters and any guest can mint an account, so guessing is throttled: lookups per user, failed hellos
// per address, and messages per socket.
const MINUTE_MS = 60_000;
const LOOKUPS_PER_MINUTE = 30;
const FAILED_HELLOS_PER_MINUTE = 20;
const SOCKET_MESSAGES_PER_SECOND = 30;
const lookupLimiter = createRateLimiter();
const failedHelloLimiter = createRateLimiter();
/** A client dedupes its own reports, so a real one sends a handful; a loop gets refused instead of written. */
const ISSUE_REPORTS_PER_MINUTE = 30;
const issueLimiter = createRateLimiter();
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
        album: t.album,
        albumId: t.albumId,
        durationMs: Math.round(t.duration * 1000),
        gainDb: t.gainDb,
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
  return {
    userId: user.id,
    name: nameOf(user),
    kind: user.kind === 'guest' ? 'guest' : 'account',
    avatarId: user.avatar_id,
  };
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

  // Leave without the socket: a Leave pressed while reconnecting would otherwise be lost, and the server would keep the
  // member (and `/rooms/mine` would put them back in) for the away grace period. 204 whether or not they were in one.
  fastify.post('/rooms/leave', { preHandler: fastify.authenticate }, async (request, reply) => {
    const code = rooms.codeOfUser(request.user!.id);
    if (code) rooms.leave(code, request.user!.id);
    return reply.code(204).send();
  });

  // Invites (A255). Accounts only, both ways: guests aren't listed anywhere social (A239-A241), so they can't be
  // picked, and don't get a list of everyone to pick from.
  const accountsOnly = { preHandler: [fastify.authenticate, fastify.requireAccount] };

  // Everyone the sender could invite: other accounts not already in their room.
  fastify.get('/rooms/invitable', accountsOnly, async (request) => {
    const code = rooms.codeOfUser(request.user!.id);
    const inRoom = new Set(code ? rooms.snapshot(code)?.members.map((m) => m.userId) : []);
    return { people: invitablePeople(request.user!.id).filter((p) => !inRoom.has(p.id)) };
  });

  fastify.post<{ Body: { userIds?: unknown } }>('/rooms/invites', accountsOnly, async (request, reply) => {
    const userIds = request.body?.userIds;
    if (
      !Array.isArray(userIds) ||
      userIds.length === 0 ||
      userIds.length > MAX_INVITES_PER_CALL ||
      !userIds.every((id) => Number.isInteger(id) && id > 0)
    ) {
      return reply.code(400).send({ error: `userIds must be 1 to ${MAX_INVITES_PER_CALL} user ids` });
    }
    const accounts = new Set(invitablePeople(request.user!.id).map((p) => p.id));
    if (!userIds.every((id) => accounts.has(id))) return reply.code(400).send({ error: 'Only other accounts can be invited' });
    const result = rooms.invite(request.user!.id, userIds as number[]);
    if (!result.ok) {
      return result.reason === 'not-allowed'
        ? reply.code(403).send({ error: 'Only the host can invite people to this room' })
        : reply.code(409).send({ error: 'You are not in a room' });
    }
    return { invited: result.invited };
  });

  // Polled by both clients; accepting is the ordinary join with the invite's code.
  fastify.get('/rooms/invites', accountsOnly, async (request) => ({
    invites: rooms.invitesFor(request.user!.id).flatMap((invite) => {
      const room = rooms.snapshot(invite.code);
      const from = findUserById(invite.fromUserId);
      if (!room || !from) return [];
      const playing = room.queue[room.current];
      return [
        {
          code: invite.code,
          from: { id: from.id, name: nameOf(from), avatarId: from.avatar_id },
          members: room.members.map((m) => m.name),
          nowPlaying: playing ? { title: playing.title, artist: playing.artist } : null,
          expiresAt: invite.expiresAt,
        },
      ];
    }),
  }));

  fastify.delete<{ Params: { code: string } }>('/rooms/invites/:code', accountsOnly, async (request, reply) => {
    rooms.declineInvite(request.user!.id, request.params.code);
    return reply.code(204).send();
  });

  // For the join screen: who's there and what's on, before connecting.
  fastify.get<{ Params: { code: string } }>(
    '/rooms/:code',
    { preHandler: fastify.authenticate },
    async (request, reply) => {
      const rate = lookupLimiter.check(String(request.user!.id), { limit: LOOKUPS_PER_MINUTE, windowMs: MINUTE_MS });
      if (!rate.allowed) {
        return replyRateLimited(reply, rate, 'Too many tries. Wait a little.');
      }
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

  // Room issue log: what the clients would otherwise swallow (parse failures, dropped sockets, failed requests).
  // Guests too, they join rooms. Read back through `GET /admin/room-issues`.
  fastify.post<{ Body: Record<string, unknown> }>(
    '/rooms/issues',
    { preHandler: fastify.authenticate },
    async (request, reply) => {
      const rate = issueLimiter.check(String(request.user!.id), { limit: ISSUE_REPORTS_PER_MINUTE, windowMs: MINUTE_MS });
      if (!rate.allowed) return replyRateLimited(reply, rate, 'Too many reports');

      const body = request.body ?? {};
      const text = (value: unknown) => (typeof value === 'string' && value.length > 0 ? value : undefined);
      const kind = body.kind;
      const message = text(body.message);
      if (typeof kind !== 'string' || !(ROOM_ISSUE_KINDS as readonly string[]).includes(kind) || !message) {
        return reply.code(400).send({ error: 'kind and message are required' });
      }
      const source = body.source === 'android' ? 'android' : 'web';
      const issue = {
        source,
        kind: kind as RoomIssueKind,
        message,
        roomCode: text(body.roomCode),
        detail: text(body.detail),
        httpStatus: Number.isInteger(body.httpStatus) ? (body.httpStatus as number) : undefined,
        appVersion: text(body.appVersion),
      } as const;
      request.log.warn(
        { userId: request.user!.id, username: request.user!.username, ...issue },
        'Client reported a room issue',
      );
      recordRoomIssue({ userId: request.user!.id, userAgent: request.headers['user-agent'], ...issue });
      return reply.code(204).send();
    },
  );

  fastify.get('/admin/rooms', { preHandler: [fastify.authenticate, fastify.requireAdmin] }, async () => ({
    serverNow: rooms.now(),
    rooms: rooms.overview(),
  }));

  fastify.get('/rooms/ws', { websocket: true }, (socket: WebSocket, request) => {
    const ip = clientIp(request);
    let windowStart = 0;
    let windowCount = 0;
    let joined: { code: string; userId: number; sessionVersion: number; connection: Connection } | null = null;

    const send = (message: object) => {
      if (socket.readyState === socket.OPEN) socket.send(JSON.stringify(message));
    };
    const closeWith = (reason: string) => {
      send({ type: 'closed', reason });
      socket.close(4000, reason);
    };
    // Only once a user is known: before the hello anyone on the internet could write rows and push real ones out.
    const logIssue = (kind: RoomIssueKind, message: string, detail?: string) => {
      if (!joined) return;
      request.log.warn({ userId: joined.userId, roomCode: joined.code, kind, detail }, message);
      recordRoomIssue({
        userId: joined.userId,
        source: 'server',
        kind,
        roomCode: joined.code,
        message,
        detail,
        userAgent: request.headers['user-agent'],
      });
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
        logIssue('server-error', 'Client sent a message that is not JSON', data.toString().slice(0, 300));
        send({ type: 'error', reason: 'bad-json' });
        return;
      }

      if (joined) {
        const now = Date.now();
        if (now - windowStart >= 1000) {
          windowStart = now;
          windowCount = 0;
        }
        if (++windowCount > SOCKET_MESSAGES_PER_SECOND) {
          // Once per window, not once per refused message.
          if (windowCount === SOCKET_MESSAGES_PER_SECOND + 1) logIssue('server-error', 'Client sent too many messages');
          send({ type: 'error', reason: 'rate-limited' });
          return;
        }
      }

      if (!joined) {
        const hello = { limit: FAILED_HELLOS_PER_MINUTE, windowMs: MINUTE_MS };
        if (!failedHelloLimiter.peek(ip, hello).allowed) {
          closeWith('rate-limited');
          return;
        }
        if (message.type !== 'hello' || typeof message.code !== 'string') {
          closeWith('no-hello');
          return;
        }
        const member = memberFromToken(message.token);
        if (!member) {
          failedHelloLimiter.check(ip, hello);
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
          failedHelloLimiter.check(ip, hello);
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
            logIssue('server-closed', 'Session no longer valid, closed the room socket');
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
          logIssue('server-error', 'Client sent an unknown message type', String(message.type).slice(0, 100));
          send({ type: 'error', reason: 'unknown-type' });
      }
    });
  });
};

export default roomsRoute;
