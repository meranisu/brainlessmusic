import type { FastifyPluginAsync } from 'fastify';
import { findTrackById } from '../db/library.js';
import { getTrackSummariesByIds } from '../db/browse.js';
import { encodeFeedCursor, listFeed, parseFeedCursor, setHideActivity, visiblePeople } from '../db/social.js';
import { listListeners } from '../services/streamMonitor.js';
import { rooms } from './rooms.js';

const FEED_LIMIT = 30;
const MAX_FEED_LIMIT = 100;

/**
 * Friends' now playing and the activity feed (A239-A241). Accounts only: guests neither see nor appear. Everyone sees
 * everyone (A240), minus anyone who switched on "Hide my activity".
 */
const socialRoute: FastifyPluginAsync = async (fastify) => {
  const accountsOnly = { preHandler: [fastify.authenticate, fastify.requireAccount] };

  // Built on the control centre's listeners: players check in through `PUT /me/playback-state` every 10 s and drop out
  // 30 s after the last one, or at once on pause.
  fastify.get('/social/now-playing', accountsOnly, async (request, reply) => {
    const people = visiblePeople(request.user!.id);
    // One line per person: the device heard from most recently wins when they play on two.
    type Line = { userId: number; trackId: number; positionSeconds: number; since: string };
    const latest = new Map<number, Line>();
    for (const listener of listListeners()) {
      if (people.has(listener.userId)) latest.set(listener.userId, listener);
    }
    // A room's players don't check in (the queue is the room's), so the room says what they're hearing (A255).
    for (const id of people.keys()) {
      const code = rooms.codeOfUser(id);
      const playing = code ? rooms.playingIn(code) : undefined;
      if (!playing || latest.has(id)) continue;
      const since = new Date(Date.now() - playing.positionMs).toISOString();
      latest.set(id, { userId: id, trackId: playing.trackId, positionSeconds: playing.positionMs / 1000, since });
    }
    const visible = [...latest.values()].filter((l) => findTrackById(l.trackId)?.hidden === 0);
    const tracks = new Map(getTrackSummariesByIds(visible.map((l) => l.trackId)).map((t) => [t.id, t]));
    return reply.send({
      listening: visible.flatMap((l) => {
        const track = tracks.get(l.trackId);
        return track
          ? [
              {
                person: people.get(l.userId)!,
                track,
                positionSeconds: l.positionSeconds,
                since: l.since,
                // So a friend's card can offer Join (A255).
                roomCode: rooms.codeOfUser(l.userId) ?? null,
              },
            ]
          : [];
      }),
    });
  });

  fastify.get<{ Querystring: { before?: string; limit?: string } }>('/social/feed', accountsOnly, async (request, reply) => {
    const { before, limit } = request.query;
    const cursor = before === undefined ? null : parseFeedCursor(before);
    if (cursor === undefined) return reply.code(400).send({ error: 'before must be a nextBefore value from the feed' });
    const size = limit === undefined ? FEED_LIMIT : Number(limit);
    if (!Number.isInteger(size) || size < 1 || size > MAX_FEED_LIMIT) {
      return reply.code(400).send({ error: `limit must be 1 to ${MAX_FEED_LIMIT}` });
    }
    const items = listFeed(request.user!.id, cursor, size);
    return reply.send({ items, nextBefore: items.length === size ? encodeFeedCursor(items[items.length - 1]) : null });
  });

  fastify.put<{ Body: { hidden?: unknown } }>('/me/activity-visibility', accountsOnly, async (request, reply) => {
    const hidden = request.body?.hidden;
    if (typeof hidden !== 'boolean') return reply.code(400).send({ error: 'hidden must be true or false' });
    setHideActivity(request.user!.id, hidden);
    return reply.code(204).send();
  });
};

export default socialRoute;
