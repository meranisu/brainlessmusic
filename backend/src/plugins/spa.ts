import { existsSync } from 'node:fs';
import { join, sep } from 'node:path';
import fastifyStatic from '@fastify/static';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

/**
 * Serves the built web app from the API's origin, so the container works alone and CORS never applies.
 * A no-op without `FRONTEND_PATH` (local dev, where Vite serves it).
 */
export function registerSpa(app: FastifyInstance, frontendPath: string): boolean {
  if (!frontendPath || !existsSync(join(frontendPath, 'index.html'))) return false;

  app.register(fastifyStatic, {
    root: frontendPath,
    wildcard: false,
    // Off so the header below is the only Cache-Control sent.
    cacheControl: false,
    // /assets/ names carry a content hash, so they cache for a year; index.html must revalidate or a deploy never lands.
    setHeaders: (reply, path) => {
      const isHashedAsset = path.startsWith(join(frontendPath, 'assets') + sep);
      reply.header('Cache-Control', isHashedAsset ? 'public, max-age=31536000, immutable' : 'no-cache');
    },
  });

  // Client-side routes like /albums/3 are not files on disk, so anything the
  // router didn't match falls through to index.html and React resolves it.
  app.setNotFoundHandler((request: FastifyRequest, reply: FastifyReply) => {
    // Navigations only: an API 404 must still get JSON.
    const wantsHtml = (request.headers.accept ?? '').includes('text/html');
    if (request.method === 'GET' && wantsHtml) {
      return reply.type('text/html').sendFile('index.html');
    }
    return reply.code(404).send({ error: 'Not found' });
  });

  return true;
}
