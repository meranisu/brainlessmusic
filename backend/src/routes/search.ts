import type { FastifyPluginAsync } from 'fastify';
import { searchLibrary } from '../db/browse.js';
import { searchPlaylists } from '../db/playlists.js';
import { searchPeople } from '../db/profile.js';
import { pickTopResult, suggestSpelling } from '../services/searchHelp.js';
import { isAdminRequest } from '../utils/isAdmin.js';

/** Results per kind on the all-kinds page. */
const PREVIEW = 20;
const PEOPLE_PREVIEW = 10;
/** A "See all" page: default and most. */
const PAGE = 30;
const MAX_PAGE = 50;

const KINDS = ['tracks', 'artists', 'albums', 'playlists', 'people'] as const;
type Kind = (typeof KINDS)[number];

function wholeNumber(raw: string | undefined, fallback: number): number | undefined {
  if (raw === undefined) return fallback;
  const n = Number(raw);
  return Number.isInteger(n) && n >= 0 ? n : undefined;
}

const searchRoute: FastifyPluginAsync = async (fastify) => {
  /**
   * Without `type`: every kind, a few of each, with `hasMore` per kind, the `top` result, and when nothing matched a
   * `suggestion` ("Did you mean …?"). With `type`: one kind, a page at `offset` (for "See all"), and `hasMore`.
   */
  fastify.get<{ Querystring: { q?: string; type?: string; limit?: string; offset?: string } }>(
    '/search',
    { preHandler: fastify.authenticate },
    async (request, reply) => {
      const q = request.query.q?.trim();
      if (!q) {
        return reply.code(400).send({ error: 'q query parameter is required' });
      }
      const admin = isAdminRequest(request);
      const viewer = request.user!.id;

      const type = request.query.type;
      if (type !== undefined) {
        if (!KINDS.includes(type as Kind)) {
          return reply.code(400).send({ error: `type must be one of ${KINDS.join(', ')}` });
        }
        const limit = wholeNumber(request.query.limit, PAGE);
        const offset = wholeNumber(request.query.offset, 0);
        if (limit === undefined || offset === undefined || limit < 1) {
          return reply.code(400).send({ error: 'limit and offset must be whole numbers' });
        }
        const kind = type as Kind;
        const page = {
          limit: Math.min(limit, MAX_PAGE) + 1,
          offset,
          only: kind === 'playlists' || kind === 'people' ? undefined : kind,
        };
        // One extra row says whether there is more.
        const rows: unknown[] =
          kind === 'playlists'
            ? searchPlaylists(q, viewer, page.limit, offset)
            : kind === 'people'
              ? searchPeople(q, page.limit, offset)
              : searchLibrary(q, admin, page)[kind];
        return reply.send({ type: kind, items: rows.slice(0, page.limit - 1), hasMore: rows.length >= page.limit, offset });
      }

      // Playlists too: the caller's own and everyone's public ones (A162). And people, to reach a profile (A172).
      const library = searchLibrary(q, admin, { limit: PREVIEW + 1, offset: 0 });
      const playlists = searchPlaylists(q, viewer, PREVIEW + 1);
      const people = searchPeople(q, PEOPLE_PREVIEW + 1);
      const results = {
        artists: library.artists.slice(0, PREVIEW),
        albums: library.albums.slice(0, PREVIEW),
        tracks: library.tracks.slice(0, PREVIEW),
        playlists: playlists.slice(0, PREVIEW),
        people: people.slice(0, PEOPLE_PREVIEW),
      };
      const nothing = Object.values(results).every((list) => list.length === 0);
      return reply.send({
        ...results,
        hasMore: {
          artists: library.artists.length > PREVIEW,
          albums: library.albums.length > PREVIEW,
          tracks: library.tracks.length > PREVIEW,
          playlists: playlists.length > PREVIEW,
          people: people.length > PEOPLE_PREVIEW,
        },
        top: pickTopResult(q, results),
        suggestion: nothing ? suggestSpelling(q, admin) : null,
      });
    },
  );
};

export default searchRoute;
