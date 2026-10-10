import type { FastifyPluginAsync } from 'fastify';
import {
  MAX_QUEUE_LENGTH,
  clearPlaybackState,
  loadPlaybackState,
  savePlaybackState,
} from '../db/playbackState.js';

interface SaveBody {
  queue?: unknown;
  queueIndex?: unknown;
  positionSeconds?: unknown;
}

/** Rejects rather than coerces: a clamped index would resume someone where they never were. */
function validate(body: SaveBody): { queue: number[]; queueIndex: number; positionSeconds: number } | string {
  const { queue, queueIndex, positionSeconds } = body;

  if (!Array.isArray(queue) || queue.length === 0) {
    return 'queue must be a non-empty array of track ids';
  }
  if (queue.length > MAX_QUEUE_LENGTH) {
    return `queue may not exceed ${MAX_QUEUE_LENGTH} tracks`;
  }
  if (!queue.every((id) => Number.isInteger(id) && (id as number) > 0)) {
    return 'queue must contain only positive integer track ids';
  }
  if (!Number.isInteger(queueIndex) || (queueIndex as number) < 0 || (queueIndex as number) >= queue.length) {
    return 'queueIndex must be an integer within the queue';
  }
  if (typeof positionSeconds !== 'number' || !Number.isFinite(positionSeconds) || positionSeconds < 0) {
    return 'positionSeconds must be a non-negative finite number';
  }

  return {
    queue: queue as number[],
    queueIndex: queueIndex as number,
    positionSeconds: positionSeconds as number,
  };
}

const playbackStateRoute: FastifyPluginAsync = async (fastify) => {
  // Nothing saved is `state: null`, not a 404, so a fresh client logs no error.
  fastify.get('/me/playback-state', { preHandler: fastify.authenticate }, async (request, reply) => {
    return reply.send({ state: loadPlaybackState(request.user!.id) });
  });

  fastify.put<{ Body: SaveBody }>(
    '/me/playback-state',
    { preHandler: fastify.authenticate },
    async (request, reply) => {
      const result = validate(request.body ?? {});
      if (typeof result === 'string') return reply.code(400).send({ error: result });

      savePlaybackState(request.user!.id, result);
      return reply.code(204).send();
    },
  );

  // Closing the player means "I'm done", so the saved state goes too.
  fastify.delete('/me/playback-state', { preHandler: fastify.authenticate }, async (request, reply) => {
    clearPlaybackState(request.user!.id);
    return reply.code(204).send();
  });
};

export default playbackStateRoute;
