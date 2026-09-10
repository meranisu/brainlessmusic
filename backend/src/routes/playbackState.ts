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

/**
 * Rejects rather than coerces.
 *
 * A clamped index or a silently-truncated queue would resume someone at a
 * place they never were, which is worse than not resuming: it looks like the
 * feature worked. The client controls both values exactly, so anything outside
 * the range is a bug worth hearing about, not input worth rescuing.
 */
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
  // `state` is null rather than a 404 when nothing is saved: a listener who has
  // never played anything is the normal first case, not a missing resource, and
  // a 404 would make every fresh client log an error on startup.
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

  // Closing the player is a deliberate "I am done", so it has to erase the
  // state as well. Leaving it behind means the next tab resumes a queue the
  // listener already dismissed.
  fastify.delete('/me/playback-state', { preHandler: fastify.authenticate }, async (request, reply) => {
    clearPlaybackState(request.user!.id);
    return reply.code(204).send();
  });
};

export default playbackStateRoute;
