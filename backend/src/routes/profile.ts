import type { FastifyPluginAsync, FastifyRequest } from 'fastify';
import { config } from '../config.js';
import { countFavoritesForUser, listFavoritesForUser } from '../db/favorites.js';
import { findTrackById } from '../db/library.js';
import { countLessOften } from '../db/lessOften.js';
import { getTopGenres, getUserStats, listLessOftenTracks, type StatsRange } from '../db/listeningStats.js';
import { listPlaylistsForUser, listPublicPlaylistsOf } from '../db/playlists.js';
import {
  MAX_BIO_LENGTH,
  getAvatarId,
  getProfileHeader,
  isAvatarInUse,
  listPeople,
  setAvatarId,
  updateProfile,
  type ProfileUpdate,
} from '../db/profile.js';
import { db } from '../db/connection.js';
import {
  MAX_AVATAR_BYTES,
  releaseAvatarSlot,
  removeAvatar,
  saveAvatar,
  sendAvatar,
  takeAvatarSlot,
} from '../services/avatars.js';
import { createRateLimiter } from '../services/rateLimit.js';
import { isAdminRequest } from '../utils/isAdmin.js';
import { parsePagination } from '../utils/pagination.js';

/**
 * The profile page (A167-A170): anyone signed in, guests included, can see any account's profile, its liked and
 * disliked songs among it (A168). Guests have no profile of their own. Your own shows your private playlists too.
 */

const RANGES: StatsRange[] = ['week', 'month', 'year', 'all'];
/** Per top list on the profile. */
const TOP_LIMIT = 10;
/** Liked and disliked songs shown on the profile before "See all". */
const PREVIEW_LIMIT = 12;
/** Picture uploads per account (S7): plenty for trying a few crops, too few to keep two crop slots busy. */
const AVATAR_UPLOAD_LIMIT = { limit: 10, windowMs: 10 * 60 * 1000 };
const avatarLimiter = createRateLimiter();

function parseId(raw: string): number | undefined {
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : undefined;
}

/**
 * Hidden songs leave someone else's lists unless an admin is looking, as they leave browsing (A34). Filtered in the
 * queries, not afterwards, so totals and pages agree with what is listed.
 */
function seesHidden(request: FastifyRequest, ownerId: number): boolean {
  return request.user!.id === ownerId || isAdminRequest(request);
}

const profileRoute: FastifyPluginAsync = async (fastify) => {
  fastify.get('/people', { preHandler: fastify.authenticate }, async (_request, reply) => {
    return reply.send({ people: listPeople() });
  });

  fastify.get<{ Params: { id: string }; Querystring: { range?: string } }>(
    '/users/:id/profile',
    { preHandler: fastify.authenticate },
    async (request, reply) => {
      const id = parseId(request.params.id);
      const header = id === undefined ? undefined : getProfileHeader(id);
      if (!header) return reply.code(404).send({ error: 'No such profile' });

      const range = (request.query.range ?? 'month') as StatsRange;
      if (!RANGES.includes(range)) return reply.code(400).send({ error: 'range must be week, month, year or all' });

      const isSelf = request.user!.id === header.id;
      const hidden = seesHidden(request, header.id);
      const stats = getUserStats(header.id, range, TOP_LIMIT, hidden)!;
      // Others see the display name only, never the login name or admin status (A174).
      const { username: _username, isAdmin: _isAdmin, ...shared } = header;

      return reply.send({
        ...(isSelf ? header : shared),
        favoriteTrack: hidden || !header.favoriteTrack?.hidden ? header.favoriteTrack : null,
        isSelf,
        range,
        totals: stats.totals,
        topTracks: stats.topTracks,
        topArtists: stats.topArtists,
        topAlbums: stats.topAlbums,
        topGenres: getTopGenres(header.id, range, TOP_LIMIT, hidden),
        // Yours includes private ones; someone else's shows only what they made public (A162).
        playlists: isSelf ? listPlaylistsForUser(header.id) : listPublicPlaylistsOf(header.id, hidden),
        liked: {
          total: countFavoritesForUser(header.id, hidden),
          tracks: listFavoritesForUser(header.id, PREVIEW_LIMIT, 0, hidden),
        },
        disliked: {
          total: countLessOften(header.id, hidden),
          tracks: listLessOftenTracks(header.id, PREVIEW_LIMIT, 0, hidden),
        },
      });
    },
  );

  fastify.get<{ Params: { id: string }; Querystring: { limit?: string; offset?: string } }>(
    '/users/:id/liked',
    { preHandler: fastify.authenticate },
    async (request, reply) => {
      const id = parseId(request.params.id);
      if (id === undefined || !getProfileHeader(id)) return reply.code(404).send({ error: 'No such profile' });
      const { limit, offset } = parsePagination(request.query);
      const hidden = seesHidden(request, id);
      const tracks = listFavoritesForUser(id, limit, offset, hidden);
      return reply.send({ total: countFavoritesForUser(id, hidden), limit, offset, tracks });
    },
  );

  fastify.get<{ Params: { id: string }; Querystring: { limit?: string; offset?: string } }>(
    '/users/:id/disliked',
    { preHandler: fastify.authenticate },
    async (request, reply) => {
      const id = parseId(request.params.id);
      if (id === undefined || !getProfileHeader(id)) return reply.code(404).send({ error: 'No such profile' });
      const { limit, offset } = parsePagination(request.query);
      const hidden = seesHidden(request, id);
      const tracks = listLessOftenTracks(id, limit, offset, hidden);
      return reply.send({ total: countLessOften(id, hidden), limit, offset, tracks });
    },
  );

  // Your bio and pinned favourites (A169). Each field is optional; null clears it.
  fastify.put<{ Body: { bio?: unknown; favoriteTrackId?: unknown; favoriteArtistId?: unknown } }>(
    '/me/profile',
    { preHandler: [fastify.authenticate, fastify.requireAccount] },
    async (request, reply) => {
      const body = request.body ?? {};
      const update: ProfileUpdate = {};
      if (body.bio !== undefined) {
        if (body.bio !== null && typeof body.bio !== 'string') return reply.code(400).send({ error: 'bio must be text' });
        if (typeof body.bio === 'string' && body.bio.trim().length > MAX_BIO_LENGTH) {
          return reply.code(400).send({ error: `bio can be at most ${MAX_BIO_LENGTH} characters` });
        }
        update.bio = body.bio;
      }
      if (body.favoriteTrackId !== undefined) {
        const trackId = body.favoriteTrackId;
        if (trackId !== null && (!Number.isInteger(trackId) || !findTrackById(trackId as number))) {
          return reply.code(400).send({ error: 'favoriteTrackId must be a song in the library, or null' });
        }
        update.favoriteTrackId = trackId as number | null;
      }
      if (body.favoriteArtistId !== undefined) {
        const artistId = body.favoriteArtistId;
        const exists =
          artistId === null ||
          (Number.isInteger(artistId) && db.prepare('SELECT 1 FROM artists WHERE id = ?').get(artistId) !== undefined);
        if (!exists) return reply.code(400).send({ error: 'favoriteArtistId must be an artist in the library, or null' });
        update.favoriteArtistId = artistId as number | null;
      }
      updateProfile(request.user!.id, update);
      return reply.send(getProfileHeader(request.user!.id));
    },
  );

  // A new picture: cropped square and stored by hash. The one it replaces is deleted unless someone else has it too.
  // Apps crop on the device first; this still checks and re-encodes everything, since a request can come from anywhere.
  fastify.put('/me/avatar', { preHandler: [fastify.authenticate, fastify.requireAccount] }, async (request, reply) => {
    // S7: every try counts, refused ones too, so a loop of bad files is stopped as well.
    const limit = avatarLimiter.check(String(request.user!.id), AVATAR_UPLOAD_LIMIT);
    if (!limit.allowed) {
      return reply
        .code(429)
        .header('Retry-After', String(limit.retryAfterSeconds))
        .send({ error: 'Too many picture changes. Try again in a few minutes.' });
    }
    const file = await request.file({ limits: { fileSize: MAX_AVATAR_BYTES, files: 1 } });
    if (!file) return reply.code(400).send({ error: 'No picture sent' });
    let image: Buffer;
    try {
      image = await file.toBuffer();
    } catch {
      return reply.code(413).send({ error: `The picture can be at most ${MAX_AVATAR_BYTES / 1024 / 1024} MB` });
    }
    // The slot is taken only once the whole file is here, so a slow upload can't hold one while it trickles in.
    if (!takeAvatarSlot()) {
      return reply.code(503).header('Retry-After', '5').send({ error: 'Busy with other pictures. Try again in a moment.' });
    }
    let avatarId: string;
    try {
      avatarId = await saveAvatar(config.avatarPath, image);
    } catch {
      return reply.code(400).send({ error: "That file couldn't be read as a picture" });
    } finally {
      releaseAvatarSlot();
    }
    const previous = setAvatarId(request.user!.id, avatarId);
    if (previous && previous !== avatarId && !isAvatarInUse(previous)) await removeAvatar(config.avatarPath, previous);
    return reply.send(getProfileHeader(request.user!.id));
  });

  fastify.delete('/me/avatar', { preHandler: [fastify.authenticate, fastify.requireAccount] }, async (request, reply) => {
    const previous = setAvatarId(request.user!.id, null);
    if (previous && !isAvatarInUse(previous)) await removeAvatar(config.avatarPath, previous);
    return reply.code(204).send();
  });

  // An image tag can't send a header, so this takes the media token like covers do.
  fastify.get<{ Params: { id: string } }>(
    '/users/:id/avatar',
    { preHandler: fastify.authenticateMedia },
    async (request, reply) => {
      const id = parseId(request.params.id);
      return sendAvatar(request, reply, config.avatarPath, id === undefined ? null : getAvatarId(id));
    },
  );
};

export default profileRoute;
