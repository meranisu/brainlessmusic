import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from 'fastify';
import { findTrackById } from '../db/library.js';
import {
  addTrackToPlaylist,
  copyPlaylist,
  createPlaylist,
  deletePlaylist,
  findPlaylistById,
  getPlaylistDetail,
  getPlaylistTrackIdsInOrder,
  isTrackInPlaylist,
  listPlaylistsForUser,
  listPublicPlaylists,
  removeTrackFromPlaylist,
  renamePlaylist,
  reorderPlaylistTracks,
  setPlaylistPublic,
  type PlaylistRow,
} from '../db/playlists.js';
import { isAdminRequest } from '../utils/isAdmin.js';

/** Longest name a copy gets before " (copy)" is added. */
const MAX_NAME_LENGTH = 200;

function parseId(raw: string): number | undefined {
  const id = Number(raw);
  return Number.isInteger(id) ? id : undefined;
}

/** Loads the playlist and checks ownership; on 404/403 it replies itself and returns undefined. */
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

/**
 * Loads a playlist the caller may read: their own, or anyone's public one (A162). A private playlist of someone else's
 * answers 404, so its existence doesn't show.
 */
function loadReadablePlaylist(
  id: number | undefined,
  userId: number,
  reply: FastifyReply,
): PlaylistRow | undefined {
  const playlist = id === undefined ? undefined : findPlaylistById(id);
  if (!playlist || (playlist.owner_id !== userId && playlist.is_public !== 1)) {
    reply.code(404).send({ error: 'Playlist not found' });
    return undefined;
  }
  return playlist;
}

const playlistsRoute: FastifyPluginAsync = async (fastify) => {
  fastify.post<{ Body: { name?: string } }>(
    '/playlists',
    { preHandler: [fastify.authenticate, fastify.requireAccount] },
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
    { preHandler: [fastify.authenticate, fastify.requireAccount] },
    async (request, reply) => {
      const playlists = listPlaylistsForUser(request.user!.id);
      return reply.send({ playlists });
    },
  );

  // Other people's public playlists, newest public first (A166). Guests too: they see and play them (A163).
  fastify.get('/playlists/public', { preHandler: fastify.authenticate }, async (request, reply) => {
    return reply.send({ playlists: listPublicPlaylists(request.user!.id, isAdminRequest(request)) });
  });

  // The owner's, or anyone's public one. Someone else's leaves out hidden tracks unless an admin is looking (A34).
  fastify.get<{ Params: { id: string } }>(
    '/playlists/:id',
    { preHandler: fastify.authenticate },
    async (request, reply) => {
      const id = parseId(request.params.id);
      const playlist = loadReadablePlaylist(id, request.user!.id, reply);
      if (!playlist) return;

      const isOwner = playlist.owner_id === request.user!.id;
      return reply.send({
        ...getPlaylistDetail(playlist.id, isOwner || isAdminRequest(request)),
        isOwner,
      });
    },
  );

  // Rename, and the public switch (A162). Either or both.
  fastify.patch<{ Params: { id: string }; Body: { name?: string; isPublic?: unknown } }>(
    '/playlists/:id',
    { preHandler: [fastify.authenticate, fastify.requireAccount] },
    async (request, reply) => {
      const id = parseId(request.params.id);
      const playlist = loadOwnedPlaylist(id, request.user!.id, reply);
      if (!playlist) return;

      const rawName = request.body?.name;
      const isPublic = request.body?.isPublic;
      if (rawName === undefined && isPublic === undefined) {
        return reply.code(400).send({ error: 'name or isPublic is required' });
      }
      if (isPublic !== undefined && typeof isPublic !== 'boolean') {
        return reply.code(400).send({ error: 'isPublic must be true or false' });
      }
      const name = rawName?.trim();
      if (rawName !== undefined && !name) {
        return reply.code(400).send({ error: 'name is required' });
      }

      if (name) renamePlaylist(playlist.id, name);
      if (isPublic !== undefined) setPlaylistPublic(playlist.id, isPublic);
      const updated = findPlaylistById(playlist.id)!;
      return reply.send({
        id: updated.id,
        name: updated.name,
        createdAt: updated.created_at,
        isPublic: updated.is_public === 1,
      });
    },
  );

  // "Save a copy" (A162): a private playlist of the caller's own, same tracks in the same order. Accounts only, since
  // a guest has no playlists (A163).
  fastify.post<{ Params: { id: string } }>(
    '/playlists/:id/copy',
    { preHandler: [fastify.authenticate, fastify.requireAccount] },
    async (request, reply) => {
      const id = parseId(request.params.id);
      const source = loadReadablePlaylist(id, request.user!.id, reply);
      if (!source) return;

      const isOwner = source.owner_id === request.user!.id;
      const name = `${source.name.slice(0, MAX_NAME_LENGTH)} (copy)`;
      const copy = copyPlaylist(source.id, request.user!.id, name, isOwner || isAdminRequest(request));
      return reply.code(201).send({ id: copy.id, name: copy.name, createdAt: copy.created_at, isPublic: false });
    },
  );

  fastify.delete<{ Params: { id: string } }>(
    '/playlists/:id',
    { preHandler: [fastify.authenticate, fastify.requireAccount] },
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
    { preHandler: [fastify.authenticate, fastify.requireAccount] },
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
    { preHandler: [fastify.authenticate, fastify.requireAccount] },
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
    { preHandler: [fastify.authenticate, fastify.requireAccount] },
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
