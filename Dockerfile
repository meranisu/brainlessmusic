# One image that serves both the API and the web app, so `docker compose up`
# gives you something to open rather than an API you still have to host a
# frontend against.
#
# Debian slim rather than Alpine on purpose: better-sqlite3 and bcrypt are
# native modules with prebuilt binaries for glibc. On musl they are compiled
# from source at install time, which needs a full toolchain in the image and
# turns a fast build into a slow, fragile one. The extra ~40 MB is worth it.

# ---------- build the web app ----------
FROM node:22-bookworm-slim AS frontend

WORKDIR /build/frontend
COPY frontend/package*.json ./
RUN npm ci

COPY frontend/ ./
# Empty base URL => the app calls the API on its own origin, which is exactly
# what it gets when served by the backend below.
ENV VITE_API_BASE_URL=""
RUN npm run build

# ---------- build the server ----------
FROM node:22-bookworm-slim AS backend

WORKDIR /build/backend
COPY backend/package*.json ./
RUN npm ci

COPY backend/ ./
RUN npm run build

# Drop dev dependencies from the tree that gets copied into the runtime image.
RUN npm prune --omit=dev

# ---------- runtime ----------
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

# Defaults point at the two volumes declared in compose. Everything here can be
# overridden; JWT_SECRET deliberately has no default, because NODE_ENV is
# production and the server refuses to boot without a real one.
ENV PORT=3000 \
    DB_PATH=/data/brainlessmusic.db \
    LIBRARY_PATH=/library \
    ARTWORK_PATH=/data/artwork \
    UPLOAD_STAGING_PATH=/data/upload-staging \
    FRONTEND_PATH=/app/public

# `node` is a non-root user that the base image already provides. The library
# and data volumes must be writable by it — uploads are filed into the library,
# and the database lives in /data.
RUN mkdir -p /data /library && chown -R node:node /data /library
USER node

EXPOSE 3000

# Hits the same endpoint the app exposes, so the check fails for the same
# reasons a user would see a failure.
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# Migrations run on every start: they are idempotent, and a container that
# boots against a schema older than its code is a worse failure than a few
# milliseconds of startup cost.
CMD ["sh", "-c", "node dist/db/migrate.js && node dist/index.js"]
