import jwt from 'jsonwebtoken';
import { config } from '../config.js';

export interface TokenUser {
  id: number;
  username: string;
}

/**
 * Marks a token as usable only for media URLs. Session tokens carry no
 * `scope` claim at all, so the two are never interchangeable in either
 * direction — see `verifySessionToken` / `verifyMediaToken`.
 */
const MEDIA_SCOPE = 'media';

export function signToken(user: TokenUser): string {
  return jwt.sign({ sub: user.id, username: user.username }, config.jwtSecret, {
    expiresIn: config.jwtExpiresIn,
  } as jwt.SignOptions);
}

/**
 * Short-lived token for URLs that a browser element loads on its own —
 * `<audio src>` and, later, `<img src>` for cover art — neither of which can
 * send an Authorization header.
 *
 * Deliberately narrower than a session token in both dimensions: it expires in
 * `MEDIA_TOKEN_TTL` (hours, not the session's days), and its `media` scope is
 * refused by `verifySessionToken`. So a stream URL that leaks the way URLs do
 * — browser history, a proxy access log, a screenshot, a shared link — cannot
 * be replayed against the rest of the API, and stops working shortly anyway.
 */
export function signMediaToken(user: TokenUser): string {
  return jwt.sign({ sub: user.id, username: user.username, scope: MEDIA_SCOPE }, config.jwtSecret, {
    expiresIn: config.mediaTokenTtl,
  } as jwt.SignOptions);
}

/**
 * Verifies a token presented as an API bearer credential. Throws on anything
 * scoped — a media token must never buy API access.
 */
export function verifySessionToken(token: string): TokenUser {
  const payload = jwt.verify(token, config.jwtSecret) as jwt.JwtPayload;

  if (payload.scope !== undefined) {
    throw new Error(`Token scoped to "${payload.scope}" cannot be used as a bearer credential`);
  }

  return { id: Number(payload.sub), username: payload.username as string };
}

/**
 * Verifies a token presented in a media URL's `?token=`. Throws on a session
 * token, so putting a long-lived credential in a URL is never the path of
 * least resistance for a client.
 */
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
