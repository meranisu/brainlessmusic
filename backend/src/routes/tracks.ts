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
import { findTrackArtworkId } from '../db/artwork.js';
import { peaksForTrack } from '../services/waveform.js';
import {
  deleteTrackRow,
  findTrackById,
  setLastStreamError,
  setTrackFlags,
  updateTrackFields,
  upsertTrack,
  type TrackRow,
} from '../db/library.js';
import { recordPlaybackFailure } from '../db/playbackFailures.js';
import { findLibraryRootByPath, listLibraryRoots } from '../db/libraryRoots.js';
import { findUserById } from '../db/users.js';
import { countHistoryForTrack, listHistoryForTrack, recordScrobble } from '../db/plays.js';
import {
  buildETag,
  ifRangeAllowsRange,
  isNotModified,
  isWebKitOnlyClient,
  mimeTypeFor,
  parseRange,
  LOW_QUALITY_BITRATE_BPS,
  LOW_QUALITY_VARIANT,
  NoTranscodeSlotError,
  REMUX_M4A_VARIANT,
  WEBKIT_COMPAT_VARIANT,
  WEBKIT_INCOMPATIBLE_EXTENSIONS,
  type Variant,
} from '../services/streaming.js';
import { getOrCreate, warm } from '../services/transcodeCache.js';
import { recordStreamError, streamEnded, streamStarted } from '../services/streamMonitor.js';
import { sendCover } from '../services/artwork.js';
import { persistArtwork } from '../services/artworkIngest.js';
import { fileIntoLibrary } from '../services/trackFiling.js';
import { AUDIO_EXTENSIONS, extractTrackTags } from '../services/trackTags.js';
import { parsePagination } from '../utils/pagination.js';
import { isInside } from '../utils/paths.js';

/** A day, then revalidate: covers an evening of seeks, and a replaced file stops serving within a day. */
const CACHE_CONTROL = 'private, max-age=86400';

/**
 * Which converted copy to serve, if any: WebKit can't open Ogg (wins over data saver); `?compat=1` after a decode
 * error on WebKit; data saver when the source is well above target; and raw ADTS `.aac` always, remuxed for a real length.
 */
function variantFor(
  track: { path: string; bitrate: number | null },
  wantsLowQuality: boolean,
  userAgent: string | undefined,
  forceCompat: boolean,
): Variant | null {
  const ext = extname(track.path).toLowerCase();

  if ((forceCompat || WEBKIT_INCOMPATIBLE_EXTENSIONS.has(ext)) && isWebKitOnlyClient(userAgent)) {
    return WEBKIT_COMPAT_VARIANT;
  }

  if (wantsLowQuality) {
    const floor = LOW_QUALITY_BITRATE_BPS * config.transcodeMinSourceBitrateRatio;
    if (track.bitrate !== null && track.bitrate < floor) return null;
    return LOW_QUALITY_VARIANT;
  }

  return ext === '.aac' ? REMUX_M4A_VARIANT : null;
}

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
  missing?: string;
}

interface TrackPatchBody {
  title?: string;
  artist?: string | null;
  album?: string | null;
  trackNumber?: number | null;
  hidden?: boolean;
  notRecommended?: boolean;
}

interface BulkFlagsBody {
  ids?: unknown;
  hidden?: unknown;
  notRecommended?: unknown;
}

/** The most ids one bulk request may carry. Selection is of loaded rows, so this is far above any real use. */
const MAX_BULK_IDS = 5000;

/** Distinct positive integer ids, or an error message for a 400. */
function parseBulkIds(ids: unknown): number[] | string {
  if (!Array.isArray(ids) || ids.length === 0) return 'ids must be a non-empty array of track ids';
  if (ids.length > MAX_BULK_IDS) return `ids may not exceed ${MAX_BULK_IDS} tracks`;
  if (!ids.every((id) => Number.isInteger(id) && (id as number) > 0)) {
    return 'ids must contain only positive integer track ids';
  }
  return [...new Set(ids as number[])];
}

/** Removes the file, then the row. A file that is already gone still loses its row; any other unlink error keeps it. */
async function deleteTrackAndFile(track: TrackRow): Promise<NodeJS.ErrnoException | null> {
  // Only ever a file inside a registered folder: a bad row must not become an unlink anywhere on the disk.
  if (!listLibraryRoots().some((root) => isInside(track.path, root.path))) {
    return Object.assign(new Error(`"${track.path}" is outside every library folder`), { code: 'EOUTSIDE' });
  }
  try {
    await unlink(track.path);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') return err as NodeJS.ErrnoException;
  }
  deleteTrackRow(track.id);
  return null;
}

const tracksRoute: FastifyPluginAsync = async (fastify) => {
  fastify.get<{ Querystring: TracksQuery }>(
    '/tracks',
    { preHandler: fastify.authenticate },
    async (request, reply) => {
      const { limit, offset } = parsePagination(request.query);
      // Re-read like `requireAdmin`. The Full view is open to all, so the server must enforce what non-admins see.
      const isAdmin = Boolean(findUserById(request.user!.id)?.is_admin);
      const options = {
        search: request.query.search,
        sort: parseSort(request.query.sort),
        order: request.query.order === 'desc' ? ('desc' as const) : ('asc' as const),
        hidden: isAdmin ? parseVisibility(request.query.hidden) : ('exclude' as const),
        notRecommended: parseVisibility(request.query.notRecommended),
        // Defaults to excluding them (see `ListTracksOptions`); `?missing=only`
        // is how an admin reaches them without a separate screen.
        missing: parseVisibility(request.query.missing),
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

      // Only the client's extension is used; the staging name is generated, preventing traversal and collisions.
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
          error: 'Could not read audio tags. The file may be corrupt or unsupported.',
          message,
        });
      }

      // Uploads go to the configured folder, never to a root added for scanning an existing drive.
      const defaultRoot = findLibraryRootByPath(config.libraryPath);
      if (!defaultRoot) {
        await unlink(stagingPath).catch(() => {});
        return reply.code(500).send({ error: 'Default library root is not set up yet' });
      }

      const stats = await stat(stagingPath);
      const destPath = await fileIntoLibrary(config.libraryPath, stagingPath, data.filename, tags);

      const track = upsertTrack({ path: destPath, fileSize: stats.size, rootId: defaultRoot.id, ...tags });
      await persistArtwork(track.id, track.album_id, tags.picture);

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

  /** Bulk hide / not-recommended for the Full view's selection (A54). Ids that don't exist are skipped. */
  fastify.patch<{ Body: BulkFlagsBody }>(
    '/tracks',
    { preHandler: [fastify.authenticate, fastify.requireAdmin] },
    async (request, reply) => {
      const body = request.body ?? {};
      const ids = parseBulkIds(body.ids);
      if (typeof ids === 'string') return reply.code(400).send({ error: ids });

      const { hidden, notRecommended } = body;
      if (hidden === undefined && notRecommended === undefined) {
        return reply.code(400).send({ error: 'Nothing to change: send hidden and/or notRecommended' });
      }
      if ((hidden !== undefined && typeof hidden !== 'boolean') ||
          (notRecommended !== undefined && typeof notRecommended !== 'boolean')) {
        return reply.code(400).send({ error: 'hidden and notRecommended must be booleans' });
      }

      return reply.send({ updated: setTrackFlags(ids, { hidden, notRecommended }) });
    },
  );

  /**
   * Bulk delete (A54): POST, since a DELETE body is dropped by some proxies. Each track is removed like
   * `DELETE /tracks/:id`; one that fails doesn't stop the rest, and comes back in `failed`.
   */
  fastify.post<{ Body: { ids?: unknown } }>(
    '/tracks/delete',
    { preHandler: [fastify.authenticate, fastify.requireAdmin] },
    async (request, reply) => {
      const ids = parseBulkIds(request.body?.ids);
      if (typeof ids === 'string') return reply.code(400).send({ error: ids });

      const deleted: number[] = [];
      const failed: number[] = [];
      for (const id of ids) {
        const track = findTrackById(id);
        if (!track) continue; // already gone counts as done, not as a failure
        const err = await deleteTrackAndFile(track);
        if (err) {
          request.log.error({ err, trackId: id, path: track.path }, 'Failed to unlink track file on bulk delete');
          failed.push(id);
        } else {
          deleted.push(id);
        }
      }

      return reply.send({ deleted, failed });
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

      const err = await deleteTrackAndFile(track);
      if (err) {
        request.log.error({ err, trackId: id, path: track.path }, 'Failed to unlink track file on delete');
        return reply.code(500).send({ error: 'Failed to delete track file from disk' });
      }
      return reply.code(204).send();
    },
  );

  // `authenticateMedia`: browsers load this by URL, so a `?token=` media token works too.
  fastify.get<{
    Params: { id: string };
    Querystring: { quality?: string; token?: string; compat?: string };
  }>(
    '/tracks/:id/stream',
    { preHandler: fastify.authenticateMedia },
    async (request, reply) => {
      const id = Number(request.params.id);
      if (!Number.isInteger(id)) {
        return reply.code(404).send({ error: 'Track not found' });
      }

      const track = findTrackById(id);
      if (!track) {
        return reply.code(404).send({ error: 'Track not found' });
      }

      // Who, on what client, for every failure this handler sees. Client-side decode failures arrive via
      // `/tracks/:id/playback-failure`.
      const logContext = {
        trackId: id,
        userId: request.user!.id,
        username: request.user!.username,
        userAgent: request.headers['user-agent'],
      };

      let stats;
      try {
        stats = await stat(track.path);
      } catch (err) {
        const message = 'Track file is missing from disk';
        request.log.error({ ...logContext, err, path: track.path }, message);
        setLastStreamError(id, message);
        recordStreamError(id, message);
        recordPlaybackFailure({
          userId: logContext.userId,
          trackId: id,
          source: 'server',
          message,
          userAgent: logContext.userAgent,
        });
        return reply.code(500).send({
          error: message,
          trackId: id,
        });
      }

      // The file or a converted copy. A cache entry is a file, so ranges, ETags and 304s work the same either way.
      const variant = variantFor(
        track,
        request.query.quality === 'low',
        request.headers['user-agent'],
        request.query.compat === '1',
      );

      let servePath = track.path;
      let serveStats = stats;
      let contentType = mimeTypeFor(track.path);

      if (variant) {
        try {
          const entry = await getOrCreate(track.path, stats, variant);
          servePath = entry.path;
          serveStats = await stat(entry.path);
          contentType = variant.mimeType;
        } catch (err) {
          // Refused, not downgraded to the much larger original.
          if (err instanceof NoTranscodeSlotError) {
            request.log.warn({ ...logContext, variant: variant.id }, 'Refused a transcode: all slots busy');
            return reply
              .code(503)
              .header('Retry-After', '5')
              .send({ error: 'Too many transcodes in progress, try again shortly' });
          }

          const message = `Transcode failed: ${err instanceof Error ? err.message : String(err)}`;
          request.log.error({ ...logContext, err, variant: variant.id }, message);
          setLastStreamError(id, message);
          recordStreamError(id, message);
          recordPlaybackFailure({
            userId: logContext.userId,
            trackId: id,
            source: 'server',
            message,
            userAgent: logContext.userAgent,
          });
          return reply.code(500).send({ error: message, trackId: id });
        }
      }

      // It resolved, so clear a stale flag from an earlier, possibly transient, failure.
      if (track.last_stream_error) setLastStreamError(id, null);

      // Validators make a replay a 304. Touching a cache entry on read moves its mtime, which only invalidates early.
      const etag = buildETag(serveStats.size, serveStats.mtimeMs);
      reply.header('ETag', etag);
      reply.header('Last-Modified', serveStats.mtime.toUTCString());
      reply.header('Cache-Control', CACHE_CONTROL);
      reply.header('Accept-Ranges', 'bytes');

      if (
        isNotModified(
          {
            ifNoneMatch: request.headers['if-none-match'],
            ifModifiedSince: request.headers['if-modified-since'],
          },
          etag,
          serveStats.mtimeMs,
        )
      ) {
        return reply.code(304).send();
      }

      // If the file changed since the client's validator, resend it whole rather than splice.
      // `If-Range` is single-valued; a repeated one is ignored.
      const ifRange = request.headers['if-range'];
      const range = ifRangeAllowsRange(
        typeof ifRange === 'string' ? ifRange : undefined,
        etag,
        serveStats.mtimeMs,
      )
        ? parseRange(request.headers.range, serveStats.size)
        : 'none';

      if (range === 'invalid') {
        reply.header('Content-Range', `bytes */${serveStats.size}`);
        return reply.code(416).send({ error: 'Invalid range' });
      }

      reply.header('Content-Type', contentType);

      const sessionId = streamStarted({
        userId: logContext.userId,
        username: logContext.username,
        trackId: id,
        trackTitle: track.title,
      });
      reply.raw.on('close', () => streamEnded(sessionId));

      if (range === 'none') {
        reply.header('Content-Length', serveStats.size);
        return reply.send(createReadStream(servePath));
      }

      const { start, end } = range;
      reply.code(206);
      reply.header('Content-Range', `bytes ${start}-${end}/${serveStats.size}`);
      reply.header('Content-Length', end - start + 1);
      return reply.send(createReadStream(servePath, { start, end }));
    },
  );

  /**
   * Converts a track ahead of time with the same `variantFor()` the stream uses. Replies at once: `not-needed` means
   * served as-is, `busy` means no spare slot and it converts on play.
   */
  fastify.post<{ Params: { id: string }; Querystring: { quality?: string } }>(
    '/tracks/:id/prepare',
    { preHandler: fastify.authenticate },
    async (request, reply) => {
      const id = Number(request.params.id);
      const track = Number.isInteger(id) ? findTrackById(id) : undefined;
      if (!track) {
        return reply.code(404).send({ error: 'Track not found' });
      }

      const variant = variantFor(track, request.query.quality === 'low', request.headers['user-agent'], false);
      if (!variant) return { status: 'not-needed' };

      let stats;
      try {
        stats = await stat(track.path);
      } catch {
        // The stream route reports a missing file when it is actually played.
        return reply.code(404).send({ error: 'Track file is missing from disk' });
      }

      const status = warm(track.path, stats, variant, (err) => {
        request.log.warn({ err, trackId: id, variant: variant.id }, 'Ahead-of-time transcode failed');
      });
      return { status };
    },
  );

  /**
   * The failure the stream route can't see: bytes sent fine, but the client couldn't decode them. Logged only, not
   * fed to `/admin/health`, which carries no identities.
   */
  fastify.post<{
    Params: { id: string };
    Body: { mediaErrorCode?: number; detail?: string; contentType?: string };
  }>(
    '/tracks/:id/playback-failure',
    { preHandler: fastify.authenticate },
    async (request, reply) => {
      const id = Number(request.params.id);
      if (!Number.isInteger(id)) {
        return reply.code(404).send({ error: 'Track not found' });
      }

      if (!findTrackById(id)) {
        return reply.code(404).send({ error: 'Track not found' });
      }

      const { mediaErrorCode, detail, contentType } = request.body ?? {};
      const normalized = {
        mediaErrorCode: typeof mediaErrorCode === 'number' ? mediaErrorCode : undefined,
        detail: typeof detail === 'string' ? detail : undefined,
        contentType: typeof contentType === 'string' ? contentType : undefined,
      };
      request.log.warn(
        {
          trackId: id,
          userId: request.user!.id,
          username: request.user!.username,
          userAgent: request.headers['user-agent'],
          ...normalized,
        },
        'Client reported a playback failure',
      );
      recordPlaybackFailure({
        userId: request.user!.id,
        trackId: id,
        source: 'client',
        message: normalized.detail ?? 'Client reported a playback failure',
        mediaErrorCode: normalized.mediaErrorCode,
        contentType: normalized.contentType,
        userAgent: request.headers['user-agent'],
      });

      return reply.code(204).send();
    },
  );

  // Falls back to the album's cover when the track has none of its own.
  fastify.get<{ Params: { id: string }; Querystring: { size?: string; token?: string } }>(
    '/tracks/:id/cover',
    { preHandler: fastify.authenticateMedia },
    async (request, reply) => {
      const id = Number(request.params.id);
      if (!Number.isInteger(id)) {
        return reply.code(404).send({ error: 'Track not found' });
      }

      return sendCover(request, reply, findTrackArtworkId(id), request.query.size);
    },
  );

  // Scrubber peaks, computed on first request and cached on the row.
  fastify.get<{ Params: { id: string } }>(
    '/tracks/:id/waveform',
    { preHandler: fastify.authenticate },
    async (request, reply) => {
      const id = Number(request.params.id);
      if (!Number.isInteger(id)) {
        return reply.code(404).send({ error: 'Track not found' });
      }

      const peaks = await peaksForTrack(id);
      if (!peaks) {
        return reply.code(404).send({ error: 'No waveform available for this track' });
      }

      // Peaks only change if the file does, and a changed file is a new scan.
      reply.header('Cache-Control', 'private, max-age=86400');
      return { peaks };
    },
  );

  fastify.post<{ Params: { id: string }; Body: { msPlayed?: number } }>(
    '/tracks/:id/scrobble',
    { preHandler: [fastify.authenticate, fastify.requireAccount] },
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

      const playId = recordScrobble(request.user!.id, id, msPlayed);

      const updated = findTrackById(id)!;
      return reply.code(201).send({
        playId,
        trackId: id,
        playCount: updated.play_count,
        lastPlayedAt: updated.last_played_at,
      });
    },
  );

  fastify.get<{ Params: { id: string }; Querystring: { limit?: string; offset?: string } }>(
    '/tracks/:id/history',
    { preHandler: [fastify.authenticate, fastify.requireAccount] },
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
