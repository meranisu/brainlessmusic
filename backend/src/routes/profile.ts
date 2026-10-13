import type { FastifyPluginAsync, FastifyRequest } from 'fastify';
import { config } from '../config.js';
import type { TrackSummary } from '../db/browse.js';
import { countFavoritesForUser, listFavoritesForUser } from '../db/favorites.js';
import { findTrackById } from '../db/library.js';
import { listLessOftenTrackIds } from '../db/lessOften.js';
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
import { MAX_AVATAR_BYTES, removeAvatar, saveAvatar, sendAvatar } from '../services/avatars.js';
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

function parseId(raw: string): number | undefined {
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : undefined;
}

/** Hidden songs leave someone else's lists unless an admin is looking, as they leave browsing (A34). */
function visibleTo(request: FastifyRequest, ownerId: number): (track: TrackSummary) => boolean {
  const seesHidden = request.user!.id === ownerId || isAdminRequest(request);
  return (track) => seesHidden || !track.hidden;
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
      const visible = visibleTo(request, header.id);
      const seesHidden = isSelf || isAdminRequest(request);
      const stats = getUserStats(header.id, range, TOP_LIMIT)!;

      return reply.send({
        ...header,
        isSelf,
        range,
        totals: stats.totals,
        topTracks: stats.topTracks.filter((t) => visible(t.track)),
        topArtists: stats.topArtists,
        topAlbums: stats.topAlbums,
        topGenres: getTopGenres(header.id, range, TOP_LIMIT),
        // Yours includes private ones; someone else's shows only what they made public (A162).
        playlists: isSelf ? listPlaylistsForUser(header.id) : listPublicPlaylistsOf(header.id, seesHidden),
        liked: {
          total: countFavoritesForUser(header.id),
          tracks: listFavoritesForUser(header.id, PREVIEW_LIMIT, 0).filter(visible),
        },
        disliked: {
          total: listLessOftenTrackIds(header.id).length,
          tracks: listLessOftenTracks(header.id, PREVIEW_LIMIT, 0).filter(visible),
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
      const tracks = listFavoritesForUser(id, limit, offset).filter(visibleTo(request, id));
      return reply.send({ total: countFavoritesForUser(id), limit, offset, tracks });
    },
  );

  fastify.get<{ Params: { id: string }; Querystring: { limit?: string; offset?: string } }>(
    '/users/:id/disliked',
    { preHandler: fastify.authenticate },
    async (request, reply) => {
      const id = parseId(request.params.id);
      if (id === undefined || !getProfileHeader(id)) return reply.code(404).send({ error: 'No such profile' });
      const { limit, offset } = parsePagination(request.query);
      const tracks = listLessOftenTracks(id, limit, offset).filter(visibleTo(request, id));
      return reply.send({ total: listLessOftenTrackIds(id).length, limit, offset, tracks });
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
  fastify.put('/me/avatar', { preHandler: [fastify.authenticate, fastify.requireAccount] }, async (request, reply) => {
    const file = await request.file({ limits: { fileSize: MAX_AVATAR_BYTES, files: 1 } });
    if (!file) return reply.code(400).send({ error: 'No picture sent' });
    let image: Buffer;
    try {
      image = await file.toBuffer();
    } catch {
      return reply.code(413).send({ error: `The picture can be at most ${MAX_AVATAR_BYTES / 1024 / 1024} MB` });
    }
    let avatarId: string;
    try {
      avatarId = await saveAvatar(config.avatarPath, image);
    } catch {
      return reply.code(400).send({ error: "That file couldn't be read as a picture" });
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
