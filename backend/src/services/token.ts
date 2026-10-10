import jwt from 'jsonwebtoken';
import { config } from '../config.js';

export interface TokenUser {
  id: number;
  username: string;
}

/** Media tokens carry this scope and session tokens carry none, so neither works as the other. */
const MEDIA_SCOPE = 'media';

export function signToken(user: TokenUser): string {
  return jwt.sign({ sub: user.id, username: user.username }, config.jwtSecret, {
    expiresIn: config.jwtExpiresIn,
  } as jwt.SignOptions);
}

/**
 * Short-lived token for `<audio src>` and `<img src>` URLs, which can't send headers. Expires in `MEDIA_TOKEN_TTL`
 * and is refused as a session token, so a leaked URL can't reach the rest of the API.
 */
export function signMediaToken(user: TokenUser): string {
  return jwt.sign({ sub: user.id, username: user.username, scope: MEDIA_SCOPE }, config.jwtSecret, {
    expiresIn: config.mediaTokenTtl,
  } as jwt.SignOptions);
}

/** Verifies an API bearer token. Throws on a media token. */
export function verifySessionToken(token: string): TokenUser {
  const payload = jwt.verify(token, config.jwtSecret) as jwt.JwtPayload;

  if (payload.scope !== undefined) {
    throw new Error(`Token scoped to "${payload.scope}" cannot be used as a bearer credential`);
  }

  return { id: Number(payload.sub), username: payload.username as string };
}

/** Verifies a URL `?token=`. Throws on a session token, so long-lived credentials stay out of URLs. */
export function verifyMediaToken(token: string): TokenUser {
  const payload = jwt.verify(token, config.jwtSecret) as jwt.JwtPayload;

  if (payload.scope !== MEDIA_SCOPE) {
    throw new Error('Not a media token');
  }

  return { id: Number(payload.sub), username: payload.username as string };
}

/** Expiry of an already-signed token, in epoch milliseconds. */
export function tokenExpiresAt(token: string): number {
  const payload = jwt.decode(token) as jwt.JwtPayload | null;
  if (!payload?.exp) {
    throw new Error('Token has no expiry');
  }
  return payload.exp * 1000;
}
