import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, stat, unlink } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { extname, join } from 'node:path';
import { pipeline } from 'node:stream/promises';
import type { FastifyPluginAsync } from 'fastify';
import { config } from '../config.js';
import {
  countTracks,
  getTrackDetailById,
  getTrackSummaryById,
  listTracks,
  type SortField,
  type VisibilityFilter,
} from '../db/browse.js';
import { deleteTrackRow, findTrackById, setLastStreamError, updateTrackFields, upsertTrack } from '../db/library.js';
import { countHistoryForTrack, listHistoryForTrack, recordScrobble } from '../db/plays.js';
import { mimeTypeFor, parseRange, transcodeToLowQuality } from '../services/streaming.js';
import { recordStreamError, streamEnded, streamStarted } from '../services/streamMonitor.js';
import { fileIntoLibrary } from '../services/trackFiling.js';
import { AUDIO_EXTENSIONS, extractTrackTags } from '../services/trackTags.js';
import { parsePagination } from '../utils/pagination.js';

const SORT_FIELDS = new Set<SortField>(['title', 'artist', 'album', 'duration', 'dateAdded', 'playCount']);
const VISIBILITY_FILTERS = new Set<VisibilityFilter>(['all', 'only', 'exclude']);

function parseSort(raw: unknown): SortField | undefined {
  return typeof raw === 'string' && SORT_FIELDS.has(raw as SortField) ? (raw as SortField) : undefined;
}

function parseVisibility(raw: unknown): VisibilityFilter | undefined {
  return typeof raw === 'string' && VISIBILITY_FILTERS.has(raw as VisibilityFilter)
    ? (raw as VisibilityFilter)
    : undefined;
}

interface TracksQuery {
  limit?: string;
  offset?: string;
  search?: string;
  sort?: string;
  order?: string;
  hidden?: string;
  notRecommended?: string;
}

interface TrackPatchBody {
  title?: string;
  artist?: string | null;
  album?: string | null;
  trackNumber?: number | null;
  hidden?: boolean;
  notRecommended?: boolean;
}

const tracksRoute: FastifyPluginAsync = async (fastify) => {
  fastify.get<{ Querystring: TracksQuery }>(
    '/tracks',
    { preHandler: fastify.authenticate },
    async (request, reply) => {
      const { limit, offset } = parsePagination(request.query);
      const options = {
        search: request.query.search,
        sort: parseSort(request.query.sort),
        order: request.query.order === 'desc' ? ('desc' as const) : ('asc' as const),
        hidden: parseVisibility(request.query.hidden),
        notRecommended: parseVisibility(request.query.notRecommended),
      };

      const tracks = listTracks(limit, offset, options);
      return reply.send({ total: countTracks(options), limit, offset, tracks });
    },
  );

  fastify.post(
    '/tracks/upload',
    { preHandler: [fastify.authenticate, fastify.requireAdmin] },
    async (request, reply) => {
      const data = await request.file();
      if (!data) {
        return reply.code(400).send({ error: 'No file provided' });
      }

      const ext = extname(data.filename).toLowerCase();
      if (!AUDIO_EXTENSIONS.has(ext)) {
        data.file.resume(); // drain the stream so the request can complete
        return reply.code(400).send({ error: `Unsupported file extension: ${ext || '(none)'}` });
      }

      // Never trust the client-supplied filename beyond its extension — the
      // staging filename is generated server-side to avoid path traversal or
      // collisions.
      await mkdir(config.uploadStagingPath, { recursive: true });
      const stagingPath = join(config.uploadStagingPath, `${randomUUID()}${ext}`);

      await pipeline(data.file, createWriteStream(stagingPath));

      if (data.file.truncated) {
        await unlink(stagingPath).catch(() => {});
        return reply.code(413).send({ error: 'File exceeds maximum upload size' });
      }

      let tags;
      try {
        tags = await extractTrackTags(stagingPath, data.filename);
      } catch (err) {
        await unlink(stagingPath).catch(() => {});
        const message = err instanceof Error ? err.message : String(err);
        request.log.warn({ err, filename: data.filename }, 'Uploaded file failed tag extraction');
        return reply.code(400).send({
          error: 'Could not read audio tags — file may be corrupt or unsupported',
          message,
        });
      }

      const stats = await stat(stagingPath);
      const destPath = await fileIntoLibrary(stagingPath, data.filename, tags);

      const track = upsertTrack({ path: destPath, fileSize: stats.size, ...tags });

      return reply.code(201).send({ track: getTrackSummaryById(track.id) });
    },
  );

  fastify.get<{ Params: { id: string } }>(
    '/tracks/:id',
    { preHandler: fastify.authenticate },
    async (request, reply) => {
      const id = Number(request.params.id);
      if (!Number.isInteger(id)) {
        return reply.code(404).send({ error: 'Track not found' });
      }

      const track = getTrackDetailById(id);
      if (!track) {
        return reply.code(404).send({ error: 'Track not found' });
      }

      return reply.send(track);
    },
  );

  fastify.patch<{ Params: { id: string }; Body: TrackPatchBody }>(
    '/tracks/:id',
    { preHandler: [fastify.authenticate, fastify.requireAdmin] },
    async (request, reply) => {
      const id = Number(request.params.id);
      if (!Number.isInteger(id) || !findTrackById(id)) {
        return reply.code(404).send({ error: 'Track not found' });
      }

      const body = request.body ?? {};
      const updated = updateTrackFields(id, {
        title: body.title,
        artistName: body.artist,
        albumTitle: body.album,
        trackNumber: body.trackNumber,
        hidden: body.hidden,
        notRecommended: body.notRecommended,
      });

      if (!updated) {
        return reply.code(404).send({ error: 'Track not found' });
      }

      return reply.send(getTrackDetailById(id));
    },
  );

  fastify.delete<{ Params: { id: string } }>(
    '/tracks/:id',
    { preHandler: [fastify.authenticate, fastify.requireAdmin] },
    async (request, reply) => {
      const id = Number(request.params.id);
      if (!Number.isInteger(id)) {
        return reply.code(404).send({ error: 'Track not found' });
      }

      const track = findTrackById(id);
      if (!track) {
        return reply.code(404).send({ error: 'Track not found' });
      }

      try {
        await unlink(track.path);
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
          request.log.error({ err, trackId: id, path: track.path }, 'Failed to unlink track file on delete');
          return reply.code(500).send({ error: 'Failed to delete track file from disk' });
        }
        // File already gone — proceed to clean up the DB row anyway so the
        // library converges to "gone" rather than being stuck.
      }

      deleteTrackRow(id);
      return reply.code(204).send();
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
        const message = 'Track file is missing from disk';
        request.log.error({ err, trackId: id, path: track.path }, message);
        setLastStreamError(id, message);
        recordStreamError(id, message);
        return reply.code(500).send({
          error: message,
          trackId: id,
        });
      }

      streamStarted();
      reply.raw.on('close', streamEnded);

      if (request.query.quality === 'low') {
        reply.header('Content-Type', 'audio/ogg');
        reply.header('Accept-Ranges', 'none');
        return reply.send(
          transcodeToLowQuality(track.path, (err) => {
            const message = `Transcode failed: ${err.message}`;
            setLastStreamError(id, message);
            recordStreamError(id, message);
          }),
        );
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
