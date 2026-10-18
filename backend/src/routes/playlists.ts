import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from 'fastify';
import { findVisibleTrack } from '../utils/visibleTrack.js';
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
  setPlaylistDescription,
  setPlaylistPublic,
  setPlaylistRules,
  type PlaylistRow,
} from '../db/playlists.js';
import { checkRules, evaluateRules } from '../db/smartPlaylists.js';
import { isAdminRequest } from '../utils/isAdmin.js';
import { parseId } from '../utils/parseId.js';

/** Longest playlist name, in characters (code points, so an emoji counts once). The apps show the same limit. */
export const MAX_NAME_LENGTH = 100;
const COPY_SUFFIX = ' (copy)';

/** Longest playlist description, in characters, counted as names are. The apps show the same limit. */
export const MAX_DESCRIPTION_LENGTH = 300;

/**
 * Checks a description from a request body: text or null. Trimmed; empty or null clears it. Line breaks are kept
 * (it can run to a few lines), other control characters are refused, and it is at most MAX_DESCRIPTION_LENGTH.
 */
export function checkPlaylistDescription(raw: unknown): { description: string | null } | { error: string } {
  if (raw === null) return { description: null };
  if (typeof raw !== 'string') return { error: 'description must be text or null' };
  // Tabs (pasted from a document) become spaces rather than an error.
  const description = raw.replace(/\r\n?/g, '\n').replace(/\t/g, ' ').trim();
  if (/[\u0000-\u0008\u000b-\u001f\u007f]/.test(description)) {
    return { error: 'description cannot contain control characters' };
  }
  if ([...description].length > MAX_DESCRIPTION_LENGTH) {
    return { error: `description can be at most ${MAX_DESCRIPTION_LENGTH} characters` };
  }
  return { description: description || null };
}

/**
 * Checks a playlist name from a request body (S21): a string, not blank once trimmed, no control characters, at most
 * MAX_NAME_LENGTH. Returns the trimmed name, or the error to send back.
 */
export function checkPlaylistName(raw: unknown): { name: string } | { error: string } {
  if (typeof raw !== 'string') return { error: 'name must be text' };
  const name = raw.trim();
  if (!name) return { error: 'name is required' };
  if (/[\u0000-\u001f\u007f]/.test(name)) return { error: 'name cannot contain line breaks or control characters' };
  if ([...name].length > MAX_NAME_LENGTH) return { error: `name can be at most ${MAX_NAME_LENGTH} characters` };
  return { name };
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

/** A smart playlist fills itself from its rules (A207), so hand edits to its tracks are refused. */
function refuseIfSmart(playlist: PlaylistRow, reply: FastifyReply): boolean {
  if (playlist.rules === null) return false;
  reply.code(409).send({ error: 'Smart playlists fill themselves. Change the rules instead.' });
  return true;
}

const playlistsRoute: FastifyPluginAsync = async (fastify) => {
  // With `rules` it makes a smart playlist (A207); without, an ordinary one.
  fastify.post<{ Body: { name?: unknown; rules?: unknown } }>(
    '/playlists',
    { preHandler: [fastify.authenticate, fastify.requireAccount] },
    async (request: FastifyRequest<{ Body: { name?: unknown; rules?: unknown } }>, reply) => {
      const checked = checkPlaylistName(request.body?.name);
      if ('error' in checked) {
        return reply.code(400).send({ error: checked.error });
      }

      const rawRules = request.body?.rules;
      const rules = rawRules === undefined ? undefined : checkRules(rawRules);
      if (rules && 'error' in rules) {
        return reply.code(400).send({ error: rules.error });
      }

      const playlist = createPlaylist(checked.name, request.user!.id, rules?.rules);
      return reply.code(201).send({
        id: playlist.id,
        name: playlist.name,
        createdAt: playlist.created_at,
        isSmart: playlist.rules !== null,
      });
    },
  );

  // What the rules would pick right now, for the editor's live preview. Saves nothing. Run for the caller, whose plays
  // and likes the rules use (A208).
  fastify.post<{ Body: { rules?: unknown } }>(
    '/playlists/smart/preview',
    { preHandler: [fastify.authenticate, fastify.requireAccount] },
    async (request, reply) => {
      const checked = checkRules(request.body?.rules);
      if ('error' in checked) {
        return reply.code(400).send({ error: checked.error });
      }
      const tracks = evaluateRules(checked.rules, request.user!.id);
      return reply.send({ trackCount: tracks.length, tracks: tracks.slice(0, 50) });
    },
  );

  // `?trackId=` adds `hasTrack` to each, so "Add to playlist" can mark the ones that already hold the song.
  fastify.get<{ Querystring: { trackId?: string } }>(
    '/playlists',
    { preHandler: [fastify.authenticate, fastify.requireAccount] },
    async (request, reply) => {
      const rawTrackId = request.query.trackId;
      const trackId = rawTrackId === undefined ? undefined : parseId(rawTrackId);
      if (rawTrackId !== undefined && trackId === undefined) {
        return reply.code(400).send({ error: 'trackId must be a whole number' });
      }
      const playlists = listPlaylistsForUser(request.user!.id, trackId);
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

  // Rename, the description, the public switch (A162), and a smart playlist's rules (A207). Any of them.
  fastify.patch<{
    Params: { id: string };
    Body: { name?: unknown; description?: unknown; isPublic?: unknown; rules?: unknown };
  }>(
    '/playlists/:id',
    { preHandler: [fastify.authenticate, fastify.requireAccount] },
    async (request, reply) => {
      const id = parseId(request.params.id);
      const playlist = loadOwnedPlaylist(id, request.user!.id, reply);
      if (!playlist) return;

      const rawName = request.body?.name;
      const rawDescription = request.body?.description;
      const isPublic = request.body?.isPublic;
      const rawRules = request.body?.rules;
      if (rawName === undefined && rawDescription === undefined && isPublic === undefined && rawRules === undefined) {
        return reply.code(400).send({ error: 'name, description, isPublic or rules is required' });
      }
      if (isPublic !== undefined && typeof isPublic !== 'boolean') {
        return reply.code(400).send({ error: 'isPublic must be true or false' });
      }
      // Rules use the owner's own plays and likes, so a public one would show them to everyone (A210).
      if (isPublic === true && playlist.rules !== null) {
        return reply.code(400).send({ error: 'Smart playlists are private. Save it as a playlist to share it.' });
      }
      let rules: ReturnType<typeof checkRules> | undefined;
      if (rawRules !== undefined) {
        if (playlist.rules === null) {
          return reply.code(400).send({ error: 'Only a smart playlist has rules' });
        }
        rules = checkRules(rawRules);
        if ('error' in rules) {
          return reply.code(400).send({ error: rules.error });
        }
      }
      let name: string | undefined;
      if (rawName !== undefined) {
        const checked = checkPlaylistName(rawName);
        if ('error' in checked) {
          return reply.code(400).send({ error: checked.error });
        }
        name = checked.name;
      }
      let description: string | null | undefined;
      if (rawDescription !== undefined) {
        const checked = checkPlaylistDescription(rawDescription);
        if ('error' in checked) {
          return reply.code(400).send({ error: checked.error });
        }
        description = checked.description;
      }

      if (name) renamePlaylist(playlist.id, name);
      if (description !== undefined) setPlaylistDescription(playlist.id, description);
      if (isPublic !== undefined) setPlaylistPublic(playlist.id, isPublic);
      if (rules && 'rules' in rules) setPlaylistRules(playlist.id, rules.rules);
      const updated = findPlaylistById(playlist.id)!;
      return reply.send({
        id: updated.id,
        name: updated.name,
        description: updated.description,
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
      // Older names may be longer than the limit; the copy is cut so it fits with its suffix.
      const name = `${[...source.name].slice(0, MAX_NAME_LENGTH - COPY_SUFFIX.length).join('')}${COPY_SUFFIX}`;
      const copy = copyPlaylist(source.id, request.user!.id, name, isOwner || isAdminRequest(request));
      return reply
        .code(201)
        .send({ id: copy.id, name: copy.name, description: copy.description, createdAt: copy.created_at, isPublic: false });
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

      if (refuseIfSmart(playlist, reply)) return;

      const trackId = Number(request.body?.trackId);
      if (!Number.isInteger(trackId)) {
        return reply.code(400).send({ error: 'trackId is required' });
      }

      const track = findVisibleTrack(trackId, request);
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

      if (refuseIfSmart(playlist, reply)) return;

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

      if (refuseIfSmart(playlist, reply)) return;

      const trackIds = request.body?.trackIds;
      if (!Array.isArray(trackIds) || trackIds.some((t) => !Number.isInteger(t))) {
        return reply.code(400).send({ error: 'trackIds must be an array of track ids' });
      }

      const current = getPlaylistTrackIdsInOrder(playlist.id);
      // Each list sorted once: sorting inside the comparison made a long playlist's reorder slow.
      const wanted = [...trackIds].sort((a, b) => a - b);
      const sameSet =
        current.length === trackIds.length && [...current].sort((a, b) => a - b).every((v, i) => v === wanted[i]);

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
