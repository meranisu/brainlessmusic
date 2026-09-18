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
import { deleteTrackRow, findTrackById, setLastStreamError, updateTrackFields, upsertTrack } from '../db/library.js';
import { findLibraryRootByPath } from '../db/libraryRoots.js';
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
import { getOrCreate } from '../services/transcodeCache.js';
import { recordStreamError, streamEnded, streamStarted } from '../services/streamMonitor.js';
import { sendCover } from '../services/artwork.js';
import { persistArtwork } from '../services/artworkIngest.js';
import { fileIntoLibrary } from '../services/trackFiling.js';
import { AUDIO_EXTENSIONS, extractTrackTags } from '../services/trackTags.js';
import { parsePagination } from '../utils/pagination.js';

/**
 * A day, revalidated after. Long enough that a whole evening of listening —
 * and every seek back inside a track — is served from the browser's cache;
 * short enough that replacing a file on disk cannot keep serving the old rip
 * for a week. Matches the waveform endpoint, which caches on the same
 * reasoning.
 */
const CACHE_CONTROL = 'private, max-age=86400';

/**
 * Whether this request should be served a converted copy, and which one.
 *
 * Three independent reasons to convert:
 *
 *  - **The client can't open the container at all.** WebKit — every browser on
 *    iOS, plus desktop Safari — has never supported Ogg, so a `.opus` or
 *    `.ogg` source needs re-encoding into `.m4a` before it plays there,
 *    regardless of bitrate. Checked first: serving a *smaller* file the
 *    client still can't decode fixes nothing, so this overrides a data-saver
 *    request rather than compounding with it.
 *  - **Data saver.** Only worth it when the source is far enough above the
 *    target to pay for a second lossy generation. A strict "above 64k" test
 *    would re-encode a 121 kbps Opus file for a measured 36% saving; lossless
 *    sources, which is what this feature is for, clear the bar easily. An
 *    unknown bitrate converts, since the alternative is guessing.
 *  - **Raw ADTS, always.** A `.aac` file carries no container and therefore no
 *    duration: measured 2026-09-10, a 25.0s file reports 37.9s to both ffprobe
 *    and Chrome, which scales the seek bar by half again. Remuxing to `.m4a`
 *    copies the frames untouched into a container that states the real length.
 */
function variantFor(
  track: { path: string; bitrate: number | null },
  wantsLowQuality: boolean,
  userAgent: string | undefined,
): Variant | null {
  const ext = extname(track.path).toLowerCase();

  if (WEBKIT_INCOMPATIBLE_EXTENSIONS.has(ext) && isWebKitOnlyClient(userAgent)) {
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

      // Uploads always file into the original configured folder, not
      // whichever root happens to be scanned most recently — a root added
      // for an existing external-drive collection is for scanning it in,
      // not a destination the upload button can silently start writing to.
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

  // `authenticateMedia`, not `authenticate` — this is the one route a browser
  // loads by URL alone, so it also accepts a scoped `?token=` media token.
  fastify.get<{ Params: { id: string }; Querystring: { quality?: string; token?: string } }>(
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

      // Which bytes to serve: the file itself, or a converted copy of it.
      //
      // Everything past this point treats all three cases identically, because
      // a cache entry *is* a file — which is the entire reason the cache
      // exists. Ranges, `ETag`, `304` and a working scrubber come free.
      const variant = variantFor(track, request.query.quality === 'low', request.headers['user-agent']);

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
          // Refused rather than downgraded to the original: whoever asked for
          // the small copy asked for a reason, and quietly sending ten times
          // the bytes is the worse answer.
          if (err instanceof NoTranscodeSlotError) {
            request.log.warn({ trackId: id }, 'Refused a transcode: all slots busy');
            return reply
              .code(503)
              .header('Retry-After', '5')
              .send({ error: 'Too many transcodes in progress, try again shortly' });
          }

          const message = `Transcode failed: ${err instanceof Error ? err.message : String(err)}`;
          request.log.error({ err, trackId: id }, message);
          setLastStreamError(id, message);
          recordStreamError(id, message);
          return reply.code(500).send({ error: message, trackId: id });
        }
      }

      // Reaching this point means the file (or its transcode) resolved fine —
      // a flag left over from an earlier, possibly transient failure (a busy
      // transcoder, a network blip) would otherwise say "broken" forever.
      if (track.last_stream_error) setLastStreamError(id, null);

      // The bytes are a stable representation, so they get validators: a
      // replayed track revalidates into a 304 instead of coming down the wire
      // again. A cache entry's mtime moves when it is touched on read, which
      // only ever invalidates a client copy early — never serves a stale one.
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

      // A reconnecting player sends the offset it stopped at together with the
      // validator it holds. If the file changed underneath, splicing new bytes
      // onto old ones hands the decoder a corrupt stream — resend the whole
      // thing instead.
      // Node types unrecognised headers as possibly-repeated; `If-Range` is
      // single-valued, and a client sending it twice has made no claim worth
      // honouring.
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

      streamStarted();
      reply.raw.on('close', streamEnded);

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

  // Peaks for the scrubber. Computed on first request and cached on the row,
  // so the first open of a track pays for the decode and every later one is a
  // single column read.
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
