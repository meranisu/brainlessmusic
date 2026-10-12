import cors from '@fastify/cors';
import multipart from '@fastify/multipart';
import websocket from '@fastify/websocket';
import Fastify from 'fastify';
import { config } from './config.js';
import { registerAuthDecorator } from './plugins/auth.js';
import { registerSpa } from './plugins/spa.js';
import albumsRoute from './routes/albums.js';
import artistsRoute from './routes/artists.js';
import authRoute from './routes/auth.js';
import favoritesRoute from './routes/favorites.js';
import lessOftenRoute from './routes/lessOften.js';
import playbackStateRoute from './routes/playbackState.js';
import healthRoute from './routes/health.js';
import historyRoute from './routes/history.js';
import libraryRoute from './routes/library.js';
import playlistsRoute from './routes/playlists.js';
import roomsRoute from './routes/rooms.js';
import searchRoute from './routes/search.js';
import lettersRoute from './routes/letters.js';
import shuffledTracksRoute from './routes/shuffledTracks.js';
import shuffleRoute from './routes/shuffle.js';
import statsRoute from './routes/stats.js';
import tracksRoute from './routes/tracks.js';
import usersRoute from './routes/users.js';
import guestCodesRoute from './routes/guestCodes.js';
import invitesRoute from './routes/invites.js';
import { redactUrl } from './utils/redactUrl.js';

export const API_PREFIX = '/api';

export function buildApp() {
  const app = Fastify({
    logger: {
      serializers: {
        // Fastify's default request fields, with `?token=` hidden: stream and
        // cover URLs carry a media token, and every request is logged.
        req: (req) => ({
          method: req.method,
          url: redactUrl(req.url),
          host: req.host,
          remoteAddress: req.ip,
          remotePort: req.socket?.remotePort,
        }),
      },
    },
  });

  registerAuthDecorator(app);

  // Same-origin by default (`config.corsOrigins`). `methods` must be explicit: @fastify/cors v11 defaults to
  // GET,HEAD,POST, and the browser preflight then silently blocks every PATCH/PUT/DELETE.
  app.register(cors, {
    origin: config.corsOrigins.length > 0 ? config.corsOrigins : false,
    methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE'],
  });

  app.register(multipart, {
    limits: {
      fileSize: config.maxUploadSizeMb * 1024 * 1024,
      files: 1,
    },
  });

  // Room sync's live connection (`routes/rooms.ts`). The biggest client message, adding 500 songs, is about 4 KB.
  app.register(websocket, { options: { maxPayload: 64 * 1024 } });

  // The API lives under /api because the web app has its own /albums, /search and /health pages on the same origin.
  app.register(
    async (api) => {
      api.register(healthRoute);
      api.register(authRoute);
      api.register(libraryRoute);
      api.register(tracksRoute);
      api.register(artistsRoute);
      api.register(albumsRoute);
      api.register(searchRoute);
      api.register(playlistsRoute);
      api.register(historyRoute);
      api.register(statsRoute);
      api.register(favoritesRoute);
      api.register(lessOftenRoute);
      api.register(playbackStateRoute);
      api.register(shuffleRoute);
      api.register(lettersRoute);
      api.register(shuffledTracksRoute);
      api.register(usersRoute);
      api.register(guestCodesRoute);
      api.register(invitesRoute);
      api.register(roomsRoute);
    },
    { prefix: API_PREFIX },
  );

  // Registered last so it only ever sees requests no API route claimed.
  registerSpa(app, config.frontendPath);

  return app;
}
