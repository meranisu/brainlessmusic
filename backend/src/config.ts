import 'dotenv/config';

export const config = {
  port: Number(process.env.PORT ?? 3000),
  dbPath: process.env.DB_PATH ?? './data/brainlessmusic.db',
  jwtSecret: process.env.JWT_SECRET ?? 'change-me',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? '7d',
  // Lifetime of the scoped tokens that ride in `<audio src>` / `<img src>`
  // URLs. Long enough to outlast any single track (an expired token only
  // breaks a later seek, never audio already streaming), short enough that a
  // leaked URL stops working the same afternoon.
  mediaTokenTtl: process.env.MEDIA_TOKEN_TTL ?? '2h',
  libraryPath: process.env.LIBRARY_PATH ?? './library',
  uploadStagingPath: process.env.UPLOAD_STAGING_PATH ?? './data/upload-staging',
  maxUploadSizeMb: Number(process.env.MAX_UPLOAD_SIZE_MB ?? 100),
};
