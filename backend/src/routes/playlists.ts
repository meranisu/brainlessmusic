import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from 'fastify';
import { findTrackById } from '../db/library.js';
import {
  addTrackToPlaylist,
  createPlaylist,
  deletePlaylist,
  findPlaylistById,
  getPlaylistDetail,
  getPlaylistTrackIdsInOrder,
  isTrackInPlaylist,
  listPlaylistsForUser,
  removeTrackFromPlaylist,
  renamePlaylist,
  reorderPlaylistTracks,
  type PlaylistRow,
} from '../db/playlists.js';

function parseId(raw: string): number | undefined {
  const id = Number(raw);
  return Number.isInteger(id) ? id : undefined;
}

/**
 * Loads the playlist and checks ownership. Sends 404/403 itself and returns
 * undefined when the caller should stop; otherwise returns the playlist row.
 */
function loadOwnedPlaylist(
  id: number | undefined,
  userId: number,
  reply: FastifyReply,
): PlaylistRow | undefined {
  if (id === undefined) {
    reply.code(404).send({ error: 'Playlist not found' });
    return undefined;
  }

  const playlist = findPlaylistById(id);
  if (!playlist) {
    reply.code(404).send({ error: 'Playlist not found' });
    return undefined;
  }

  if (playlist.owner_id !== userId) {
    reply.code(403).send({ error: 'You do not have access to this playlist' });
    return undefined;
  }

  return playlist;
}

const playlistsRoute: FastifyPluginAsync = async (fastify) => {
  fastify.post<{ Body: { name?: string } }>(
    '/playlists',
    { preHandler: fastify.authenticate },
    async (request: FastifyRequest<{ Body: { name?: string } }>, reply) => {
      const name = request.body?.name?.trim();
      if (!name) {
        return reply.code(400).send({ error: 'name is required' });
      }

      const playlist = createPlaylist(name, request.user!.id);
      return reply.code(201).send({
        id: playlist.id,
        name: playlist.name,
        createdAt: playlist.created_at,
      });
    },
  );

  fastify.get(
    '/playlists',
    { preHandler: fastify.authenticate },
    async (request, reply) => {
      const playlists = listPlaylistsForUser(request.user!.id);
      return reply.send({ playlists });
    },
  );

  fastify.get<{ Params: { id: string } }>(
    '/playlists/:id',
    { preHandler: fastify.authenticate },
    async (request, reply) => {
      const id = parseId(request.params.id);
      const playlist = loadOwnedPlaylist(id, request.user!.id, reply);
      if (!playlist) return;

      return reply.send(getPlaylistDetail(playlist.id));
    },
  );

  fastify.patch<{ Params: { id: string }; Body: { name?: string } }>(
    '/playlists/:id',
    { preHandler: fastify.authenticate },
    async (request, reply) => {
      const id = parseId(request.params.id);
      const playlist = loadOwnedPlaylist(id, request.user!.id, reply);
      if (!playlist) return;

      const name = request.body?.name?.trim();
      if (!name) {
        return reply.code(400).send({ error: 'name is required' });
      }

      renamePlaylist(playlist.id, name);
      return reply.send({ id: playlist.id, name, createdAt: playlist.created_at });
    },
  );

  fastify.delete<{ Params: { id: string } }>(
    '/playlists/:id',
    { preHandler: fastify.authenticate },
    async (request, reply) => {
      const id = parseId(request.params.id);
      const playlist = loadOwnedPlaylist(id, request.user!.id, reply);
      if (!playlist) return;

      deletePlaylist(playlist.id);
      return reply.code(204).send();
    },
  );

  fastify.post<{ Params: { id: string }; Body: { trackId?: number } }>(
    '/playlists/:id/tracks',
    { preHandler: fastify.authenticate },
    async (request, reply) => {
      const id = parseId(request.params.id);
      const playlist = loadOwnedPlaylist(id, request.user!.id, reply);
      if (!playlist) return;

      const trackId = Number(request.body?.trackId);
      if (!Number.isInteger(trackId)) {
        return reply.code(400).send({ error: 'trackId is required' });
      }

      const track = findTrackById(trackId);
      if (!track) {
        return reply.code(404).send({ error: 'Track not found' });
      }

      if (isTrackInPlaylist(playlist.id, trackId)) {
        return reply.code(409).send({ error: 'Track is already in this playlist' });
      }

      const position = addTrackToPlaylist(playlist.id, trackId);
      return reply.code(201).send({ trackId, position });
    },
  );

  fastify.delete<{ Params: { id: string; trackId: string } }>(
    '/playlists/:id/tracks/:trackId',
    { preHandler: fastify.authenticate },
    async (request, reply) => {
      const id = parseId(request.params.id);
      const playlist = loadOwnedPlaylist(id, request.user!.id, reply);
      if (!playlist) return;

      const trackId = parseId(request.params.trackId);
      if (trackId === undefined) {
        return reply.code(404).send({ error: 'Track not in playlist' });
      }

      const removed = removeTrackFromPlaylist(playlist.id, trackId);
      if (!removed) {
        return reply.code(404).send({ error: 'Track not in playlist' });
      }

      return reply.code(204).send();
    },
  );

  fastify.patch<{ Params: { id: string }; Body: { trackIds?: number[] } }>(
    '/playlists/:id/tracks/reorder',
    { preHandler: fastify.authenticate },
    async (request, reply) => {
      const id = parseId(request.params.id);
      const playlist = loadOwnedPlaylist(id, request.user!.id, reply);
      if (!playlist) return;

      const trackIds = request.body?.trackIds;
      if (!Array.isArray(trackIds) || trackIds.some((t) => !Number.isInteger(t))) {
        return reply.code(400).send({ error: 'trackIds must be an array of track ids' });
      }

      const current = getPlaylistTrackIdsInOrder(playlist.id);
      const sameSet =
        current.length === trackIds.length &&
        [...current].sort((a, b) => a - b).every((v, i) => v === [...trackIds].sort((a, b) => a - b)[i]);

      if (!sameSet) {
        return reply
          .code(400)
          .send({ error: 'trackIds must contain exactly the playlist’s current tracks' });
      }

      reorderPlaylistTracks(playlist.id, trackIds);
      return reply.send(getPlaylistDetail(playlist.id));
    },
  );
};

export default playlistsRoute;
