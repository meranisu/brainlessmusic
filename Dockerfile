# One image serves the API and the web app.
# Debian slim, not Alpine: better-sqlite3 and bcrypt ship glibc binaries and would compile from source on musl.

# Build the web app.
FROM node:22-bookworm-slim AS frontend

WORKDIR /build/frontend
COPY frontend/package*.json ./
RUN npm ci

COPY frontend/ ./
# Relative base: the app calls the API on its own origin. Keep the /api prefix, or every request
# lands on the SPA fallback (/albums, /search and /health are both pages and endpoints).
ENV VITE_API_BASE_URL="/api"
RUN npm run build

# Build the server.
FROM node:22-bookworm-slim AS backend

WORKDIR /build/backend
COPY backend/package*.json ./
RUN npm ci

COPY backend/ ./
RUN npm run build

# Drop dev dependencies from the tree that gets copied into the runtime image.
RUN npm prune --omit=dev

# Runtime.
FROM node:22-bookworm-slim AS runtime

# ffmpeg is a hard runtime dependency, not a convenience: the `?quality=low`
# transcode path and cover-art thumbnailing both shell out to it.
RUN apt-get update \
 && apt-get install -y --no-install-recommends ffmpeg \
 && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production

WORKDIR /app

COPY --from=backend /build/backend/node_modules ./node_modules
COPY --from=backend /build/backend/dist ./dist
COPY --from=backend /build/backend/package.json ./package.json
COPY --from=frontend /build/frontend/dist ./public

# Defaults match the compose volumes. JWT_SECRET has none on purpose: the server refuses to boot without a real one.
ENV PORT=3000 \
    DB_PATH=/data/brainlessmusic.db \
    LIBRARY_PATH=/library \
    ARTWORK_PATH=/data/artwork \
    UPLOAD_STAGING_PATH=/data/upload-staging \
    TRANSCODE_PATH=/data/transcodes \
    FRONTEND_PATH=/app/public

# `node` (non-root, from the base image) must be able to write both volumes: uploads go into the library.
RUN mkdir -p /data /library && chown -R node:node /data /library
USER node

EXPOSE 3000

# Hits the same endpoint the app exposes, so the check fails for the same
# reasons a user would see a failure.
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# Migrations are idempotent, so they run on every start.
CMD ["sh", "-c", "node dist/db/migrate.js && node dist/index.js"]
