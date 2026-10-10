import { existsSync } from 'node:fs';
import { join, sep } from 'node:path';
import fastifyStatic from '@fastify/static';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

/**
 * Serves the built web app from the same origin as the API, so the container
 * is useful on its own: `docker compose up` gives you something to open,
 * rather than an API you still have to point a separately-hosted frontend at.
 *
 * Same-origin also means the frontend is built with a relative
 * `VITE_API_BASE_URL` of `/api` — matching API_PREFIX — so its requests never
 * leave this origin and CORS never enters into it. No-op when `FRONTEND_PATH`
 * is unset or missing, which is the local-dev case where Vite serves the SPA
 * itself and proxies /api across to this server.
 */
export function registerSpa(app: FastifyInstance, frontendPath: string): boolean {
  if (!frontendPath || !existsSync(join(frontendPath, 'index.html'))) return false;

  app.register(fastifyStatic, {
    root: frontendPath,
    wildcard: false,
    // Off so the header below is the only Cache-Control sent.
    cacheControl: false,
    // Vite puts a content hash in every /assets/ filename, so those bytes never
    // change under a URL and can be kept for a year. index.html is what points
    // at the current hashes, so it must be revalidated every time or a deploy
    // would leave browsers on the old build.
    setHeaders: (reply, path) => {
      const isHashedAsset = path.startsWith(join(frontendPath, 'assets') + sep);
      reply.header('Cache-Control', isHashedAsset ? 'public, max-age=31536000, immutable' : 'no-cache');
    },
  });

  // Client-side routes like /albums/3 are not files on disk, so anything the
  // router didn't match falls through to index.html and React resolves it.
  app.setNotFoundHandler((request: FastifyRequest, reply: FastifyReply) => {
    // Only for navigations. An API call that 404s must still get JSON — a
    // fetch() receiving an HTML page instead of `{ error }` is a far more
    // confusing failure than a 404.
    const wantsHtml = (request.headers.accept ?? '').includes('text/html');
    if (request.method === 'GET' && wantsHtml) {
      return reply.type('text/html').sendFile('index.html');
    }
    return reply.code(404).send({ error: 'Not found' });
  });

  return true;
}
