import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import type { FastifyPluginAsync } from 'fastify';
import { countTracks, listTracks } from '../db/browse.js';
import { findTrackById } from '../db/library.js';
import { countHistoryForTrack, listHistoryForTrack, recordScrobble } from '../db/plays.js';
import { mimeTypeFor, parseRange, transcodeToLowQuality } from '../services/streaming.js';
import { parsePagination } from '../utils/pagination.js';

const tracksRoute: FastifyPluginAsync = async (fastify) => {
  fastify.get<{ Querystring: { limit?: string; offset?: string } }>(
    '/tracks',
    { preHandler: fastify.authenticate },
    async (request, reply) => {
      const { limit, offset } = parsePagination(request.query);
      const tracks = listTracks(limit, offset);
      return reply.send({ total: countTracks(), limit, offset, tracks });
    },
  );

  fastify.get<{ Params: { id: string }; Querystring: { quality?: string } }>(
    '/tracks/:id/stream',
    { preHandler: fastify.authenticate },
    async (request, reply) => {
      const id = Number(request.params.id);
      if (!Number.isInteger(id)) {
        return reply.code(404).send({ error: 'Track not found' });
      }

      const track = findTrackById(id);
      if (!track) {
        return reply.code(404).send({ error: 'Track not found' });
      }

      let stats;
      try {
        stats = await stat(track.path);
      } catch (err) {
        request.log.error(
          { err, trackId: id, path: track.path },
          'Track file missing from disk despite DB record',
        );
        return reply.code(500).send({
          error: 'Track file is missing from disk',
          trackId: id,
        });
      }

      if (request.query.quality === 'low') {
        reply.header('Content-Type', 'audio/ogg');
        reply.header('Accept-Ranges', 'none');
        return reply.send(transcodeToLowQuality(track.path));
      }

      const range = parseRange(request.headers.range, stats.size);

      if (range === 'invalid') {
        reply.header('Content-Range', `bytes */${stats.size}`);
        return reply.code(416).send({ error: 'Invalid range' });
      }

      reply.header('Accept-Ranges', 'bytes');
      reply.header('Content-Type', mimeTypeFor(track.path));

      if (range === 'none') {
        reply.header('Content-Length', stats.size);
        return reply.send(createReadStream(track.path));
      }

      const { start, end } = range;
      reply.code(206);
      reply.header('Content-Range', `bytes ${start}-${end}/${stats.size}`);
      reply.header('Content-Length', end - start + 1);
      return reply.send(createReadStream(track.path, { start, end }));
    },
  );

  fastify.post<{ Params: { id: string }; Body: { msPlayed?: number } }>(
    '/tracks/:id/scrobble',
    { preHandler: fastify.authenticate },
    async (request, reply) => {
      const id = Number(request.params.id);
      if (!Number.isInteger(id)) {
        return reply.code(404).send({ error: 'Track not found' });
      }

      const track = findTrackById(id);
      if (!track) {
        return reply.code(404).send({ error: 'Track not found' });
      }

      const rawMsPlayed = request.body?.msPlayed;
      const msPlayed =
        typeof rawMsPlayed === 'number' && Number.isFinite(rawMsPlayed) && rawMsPlayed >= 0
          ? Math.floor(rawMsPlayed)
          : null;

      recordScrobble(request.user!.id, id, msPlayed);

      const updated = findTrackById(id)!;
      return reply.code(201).send({
        trackId: id,
        playCount: updated.play_count,
        lastPlayedAt: updated.last_played_at,
      });
    },
  );

  fastify.get<{ Params: { id: string }; Querystring: { limit?: string; offset?: string } }>(
    '/tracks/:id/history',
    { preHandler: fastify.authenticate },
    async (request, reply) => {
      const id = Number(request.params.id);
      if (!Number.isInteger(id)) {
        return reply.code(404).send({ error: 'Track not found' });
      }

      const track = findTrackById(id);
      if (!track) {
        return reply.code(404).send({ error: 'Track not found' });
      }

      const { limit, offset } = parsePagination(request.query);
      const history = listHistoryForTrack(id, limit, offset);
      return reply.send({ total: countHistoryForTrack(id), limit, offset, history });
    },
  );
};

export default tracksRoute;
