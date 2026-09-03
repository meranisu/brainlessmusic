import cors from '@fastify/cors';
import multipart from '@fastify/multipart';
import Fastify from 'fastify';
import { config } from './config.js';
import { registerAuthDecorator } from './plugins/auth.js';
import albumsRoute from './routes/albums.js';
import artistsRoute from './routes/artists.js';
import authRoute from './routes/auth.js';
import favoritesRoute from './routes/favorites.js';
import healthRoute from './routes/health.js';
import historyRoute from './routes/history.js';
import libraryRoute from './routes/library.js';
import playlistsRoute from './routes/playlists.js';
import searchRoute from './routes/search.js';
import shuffleRoute from './routes/shuffle.js';
import statsRoute from './routes/stats.js';
import tracksRoute from './routes/tracks.js';

export function buildApp() {
  const app = Fastify({ logger: true });

  registerAuthDecorator(app);

  // Personal/local project, not a public API — allow any origin so local HTML
  // test pages (opened via file://, which sends Origin: null) and future
  // frontend dev servers can hit it. Auth is still enforced via JWT bearer token
  // regardless of origin.
  //
  // `methods` must be listed explicitly — @fastify/cors v11's own default is
  // 'GET,HEAD,POST' (confirmed in node_modules/@fastify/cors/index.js), not
  // the full REST set. Without this, every PATCH/PUT/DELETE route (favorites,
  // playlists, tracks) is silently blocked by the browser's CORS preflight —
  // curl-based testing never surfaces it since CORS is browser-enforced only.
  // Found 2026-09-03 via a real headless-Chromium PATCH /tracks/:id call.
  app.register(cors, { origin: true, methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE'] });

  app.register(multipart, {
    limits: {
      fileSize: config.maxUploadSizeMb * 1024 * 1024,
      files: 1,
    },
  });

  app.register(healthRoute);
  app.register(authRoute);
  app.register(libraryRoute);
  app.register(tracksRoute);
  app.register(artistsRoute);
  app.register(albumsRoute);
  app.register(searchRoute);
  app.register(playlistsRoute);
  app.register(historyRoute);
  app.register(statsRoute);
  app.register(favoritesRoute);
  app.register(shuffleRoute);

  return app;
}
