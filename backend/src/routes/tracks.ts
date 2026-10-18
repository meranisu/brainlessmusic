import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, stat, unlink } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { extname, join } from 'node:path';
import { pipeline } from 'node:stream/promises';
import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from 'fastify';
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
import { prioritizeLoudness, requestLoudnessBackfill } from '../services/loudness.js';
import {
  deleteTrackRow,
  findTrackById,
  setLastStreamError,
  setTrackFlags,
  settleAlbums,
  updateTrackFields,
  upsertTrack,
  type TrackRow,
} from '../db/library.js';
import { recordPlaybackFailure } from '../db/playbackFailures.js';
import { findLibraryRootByPath, listLibraryRoots } from '../db/libraryRoots.js';
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
import { findVisibleTrack } from '../utils/visibleTrack.js';
import { createRateLimiter } from '../services/rateLimit.js';
import { isAdminRequest } from '../utils/isAdmin.js';
import { isInside } from '../utils/paths.js';
import { parseId } from '../utils/parseId.js';
import { replyRateLimited } from '../utils/replyRateLimited.js';

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

/** A UUID in practice; anything longer or stranger is refused rather than stored. */
const CLIENT_PLAY_ID = /^[A-Za-z0-9-]{8,64}$/;

/** Failure reports one user may send per minute. */
const PLAYBACK_FAILURES_PER_MINUTE = 30;
const playbackFailureLimiter = createRateLimiter();

interface StreamLogContext {
  trackId: number;
  userId: number;
  username: string;
  userAgent: string | undefined;
}

/** Logs a server-side stream failure, records it against the track and the playback-failure log, and replies 500. */
function reportStreamFailure(
  request: FastifyRequest,
  reply: FastifyReply,
  ctx: StreamLogContext,
  message: string,
  err: unknown,
  extraLog: Record<string, unknown>,
) {
  request.log.error({ ...ctx, err, ...extraLog }, message);
  setLastStreamError(ctx.trackId, message);
  recordStreamError(ctx.trackId, message);
  recordPlaybackFailure({
    userId: ctx.userId,
    trackId: ctx.trackId,
    source: 'server',
    message,
    userAgent: ctx.userAgent,
  });
  return reply.code(500).send({ error: message, trackId: ctx.trackId });
}

const tracksRoute: FastifyPluginAsync = async (fastify) => {
  fastify.get<{ Querystring: TracksQuery }>(
    '/tracks',
    { preHandler: fastify.authenticate },
    async (request, reply) => {
      const { limit, offset } = parsePagination(request.query);
      // Re-read like `requireAdmin`. The Full view is open to all, so the server must enforce what non-admins see.
      const isAdmin = isAdminRequest(request);
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

      try {
        await pipeline(data.file, createWriteStream(stagingPath));

        if (data.file.truncated) {
          return reply.code(413).send({ error: 'File exceeds maximum upload size' });
        }

        let tags;
        try {
          tags = await extractTrackTags(stagingPath, data.filename);
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          request.log.warn({ err, filename: data.filename }, 'Uploaded file failed tag extraction');
          return reply.code(400).send({
            error: 'Could not read audio tags. The file may be corrupt or unsupported.',
            message,
          });
        }
        // music-metadata reads a text file named `.mp3` or `.wav` without complaint, it just finds no audio. Filed, it
        // would be a track that never plays. Scans stay lenient; this check is for uploads only.
        if (!tags.duration || tags.duration <= 0) {
          request.log.warn({ filename: data.filename }, 'Uploaded file has no playable audio');
          return reply.code(400).send({ error: 'No playable audio found. The file may be corrupt or not audio.' });
        }

        // Uploads go to the configured folder, never to a root added for scanning an existing drive.
        const defaultRoot = findLibraryRootByPath(config.libraryPath);
        if (!defaultRoot) {
          return reply.code(500).send({ error: 'Default library root is not set up yet' });
        }

        const stats = await stat(stagingPath);
        const destPath = await fileIntoLibrary(config.libraryPath, stagingPath, data.filename, tags);

        // The file now sits in the library under a name nobody else has. With no row it would be an orphan until the
        // next scan, and the client would think the upload failed, so a failed insert takes the file back out.
        let track: ReturnType<typeof upsertTrack>;
        try {
          track = upsertTrack({ path: destPath, fileSize: stats.size, rootId: defaultRoot.id, ...tags });
        } catch (err) {
          request.log.error({ err, destPath }, 'Upload filed but could not be saved to the database');
          await unlink(destPath).catch(() => {});
          return reply.code(500).send({ error: 'Could not save the track. Nothing was added. Try the upload again.' });
        }

        // The track exists from here. Album settling and artwork are tidying that the next scan repeats, so a failure
        // is logged, not turned into an error for a track that is in the library.
        try {
          if (track.album_id !== null) settleAlbums(new Map(), [track.album_id]);
          await persistArtwork(config.artworkPath, track.id, track.album_id, tags.picture);
        } catch (err) {
          request.log.warn({ err, trackId: track.id }, 'Upload saved but album or artwork tidy-up failed; a scan will redo it');
        }
        requestLoudnessBackfill();

        return reply.code(201).send({ track: getTrackSummaryById(track.id) });
      } finally {
        // Nothing stays in staging, whatever happened: an aborted upload, a filing or database error (C27). After a
        // successful filing the file has already moved and this finds nothing.
        await unlink(stagingPath).catch(() => {});
      }
    },
  );

  fastify.get<{ Params: { id: string } }>(
    '/tracks/:id',
    { preHandler: fastify.authenticate },
    async (request, reply) => {
      const id = parseId(request.params.id);
      if (id === undefined) {
        return reply.code(404).send({ error: 'Track not found' });
      }

      const track = getTrackDetailById(id);
      // A hidden track doesn't exist for a non-admin (A34), so it answers like a missing one.
      if (!track || (track.hidden && !isAdminRequest(request))) {
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
      const id = parseId(request.params.id);
      if (id === undefined || !findTrackById(id)) {
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
      const id = parseId(request.params.id);
      if (id === undefined) {
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
      const id = parseId(request.params.id);
      if (id === undefined) {
        return reply.code(404).send({ error: 'Track not found' });
      }

      const track = findTrackById(id);
      if (!track || (track.hidden === 1 && !isAdminRequest(request))) {
        return reply.code(404).send({ error: 'Track not found' });
      }
      prioritizeLoudness(id, track.loudness_lufs !== null);

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
        return reportStreamFailure(request, reply, logContext, 'Track file is missing from disk', err, {
          path: track.path,
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
          const entry = await getOrCreate(config.transcodePath, track.path, stats, variant);
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
          return reportStreamFailure(request, reply, logContext, message, err, { variant: variant.id });
        }
      }

      // It resolved, so clear a stale flag from an earlier, possibly transient, failure.
      if (track.last_stream_error) setLastStreamError(id, null);

      // Validators make a replay a 304. Their time is the source file's, not the served file's: a cache entry's mtime
      // moves on every hit, which made `If-Range` fail and turned seeks into full 200s. The size still tells variants apart.
      const validatorMtimeMs = stats.mtimeMs;
      const etag = buildETag(serveStats.size, validatorMtimeMs);
      reply.header('ETag', etag);
      reply.header('Last-Modified', stats.mtime.toUTCString());
      reply.header('Cache-Control', CACHE_CONTROL);
      reply.header('Accept-Ranges', 'bytes');

      if (
        isNotModified(
          {
            ifNoneMatch: request.headers['if-none-match'],
            ifModifiedSince: request.headers['if-modified-since'],
          },
          etag,
          validatorMtimeMs,
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
        validatorMtimeMs,
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
      const id = parseId(request.params.id);
      const track = id !== undefined ? findVisibleTrack(id, request) : undefined;
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

      const status = warm(config.transcodePath, track.path, stats, variant, (err) => {
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
      const id = parseId(request.params.id);
      if (id === undefined) {
        return reply.code(404).send({ error: 'Track not found' });
      }

      if (!findVisibleTrack(id, request)) {
        return reply.code(404).send({ error: 'Track not found' });
      }

      // A real client reports a handful at most; a loop gets refused instead of written.
      const rate = playbackFailureLimiter.check(String(request.user!.id), {
        limit: PLAYBACK_FAILURES_PER_MINUTE,
        windowMs: 60 * 1000,
      });
      if (!rate.allowed) {
        return replyRateLimited(reply, rate, 'Too many reports');
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
      const id = parseId(request.params.id);
      if (id === undefined) {
        return reply.code(404).send({ error: 'Track not found' });
      }

      if (!findVisibleTrack(id, request)) {
        return reply.code(404).send({ error: 'Track not found' });
      }

      return sendCover(request, reply, config.artworkPath, findTrackArtworkId(id), request.query.size);
    },
  );

  // Scrubber peaks, computed on first request and cached on the row.
  fastify.get<{ Params: { id: string } }>(
    '/tracks/:id/waveform',
    { preHandler: fastify.authenticate },
    async (request, reply) => {
      const id = parseId(request.params.id);
      if (id === undefined) {
        return reply.code(404).send({ error: 'Track not found' });
      }

      if (!findVisibleTrack(id, request)) {
        return reply.code(404).send({ error: 'Track not found' });
      }

      const peaks = await peaksForTrack(id);
      if (peaks === 'busy') {
        return reply.code(503).header('retry-after', '5').send({ error: 'Busy drawing other waveforms. Try again shortly.' });
      }
      if (!peaks) {
        return reply.code(404).send({ error: 'No waveform available for this track' });
      }

      // Peaks only change if the file does, and a changed file is a new scan.
      reply.header('Cache-Control', 'private, max-age=86400');
      return { peaks };
    },
  );

  fastify.post<{
    Params: { id: string };
    Body: { msPlayed?: number; playedAt?: unknown; clientPlayId?: unknown; skipped?: unknown };
  }>(
    '/tracks/:id/scrobble',
    { preHandler: [fastify.authenticate, fastify.requireAccount] },
    async (request, reply) => {
      const id = parseId(request.params.id);
      if (id === undefined) {
        return reply.code(404).send({ error: 'Track not found' });
      }

      const track = findVisibleTrack(id, request);
      if (!track) {
        return reply.code(404).send({ error: 'Track not found' });
      }

      const rawMsPlayed = request.body?.msPlayed;
      const msPlayed =
        typeof rawMsPlayed === 'number' && Number.isFinite(rawMsPlayed) && rawMsPlayed >= 0
          ? Math.floor(rawMsPlayed)
          : null;

      // A play made offline and sent later says when it happened (A87).
      let playedAt: string | null = null;
      if (request.body?.playedAt !== undefined && request.body.playedAt !== null) {
        playedAt = parsePlayedAt(request.body.playedAt);
        if (!playedAt) {
          return reply.code(400).send({ error: 'playedAt must be an ISO time within the last 30 days' });
        }
      }

      // The app's own id for this play (C10): a resend with the same id is counted once.
      const rawClientPlayId = request.body?.clientPlayId;
      let clientPlayId: string | null = null;
      if (rawClientPlayId !== undefined && rawClientPlayId !== null) {
        if (typeof rawClientPlayId !== 'string' || !CLIENT_PLAY_ID.test(rawClientPlayId)) {
          return reply.code(400).send({ error: 'clientPlayId must be 8-64 letters, digits or dashes' });
        }
        clientPlayId = rawClientPlayId;
      }

      // A song cut short before the threshold (A113): recorded for time listened, never counted as a play.
      const rawSkipped = request.body?.skipped;
      if (rawSkipped !== undefined && rawSkipped !== null && typeof rawSkipped !== 'boolean') {
        return reply.code(400).send({ error: 'skipped must be true or false' });
      }
      const skipped = rawSkipped === true;

      const playId = recordScrobble(request.user!.id, id, msPlayed, playedAt, clientPlayId, skipped);

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
      const id = parseId(request.params.id);
      if (id === undefined) {
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

/** How long a play made offline may wait to be sent. Older ones are refused, and the phone drops them. */
const PLAYED_AT_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
/** A phone's clock can run a little ahead of the server's. */
const PLAYED_AT_CLOCK_SKEW_MS = 5 * 60 * 1000;

/** An ISO time within the allowed window, as SQLite's `datetime('now')` shape (UTC); otherwise null. */
export function parsePlayedAt(value: unknown, now = Date.now()): string | null {
  if (typeof value !== 'string') return null;
  const ms = Date.parse(value);
  if (Number.isNaN(ms) || ms > now + PLAYED_AT_CLOCK_SKEW_MS || ms < now - PLAYED_AT_MAX_AGE_MS) return null;
  return new Date(Math.min(ms, now)).toISOString().slice(0, 19).replace('T', ' ');
}
