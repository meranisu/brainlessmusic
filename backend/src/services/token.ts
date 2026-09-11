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

/**
 * Marks a token as proof that a browser typed the admin entry code. It stands
 * for a fact about the *device*, not about a person, so it carries no `sub`
 * and identifies nobody — presenting one proves only that whoever holds it got
 * past the numpad, which is exactly as much as it should be able to say.
 */
const UNLOCK_SCOPE = 'unlock';

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

/**
 * Short-lived proof that the admin entry code was entered correctly. Held by
 * the browser for minutes, and required by `POST /auth/login` while
 * `ADMIN_ENTRY_CODE` is set — which is the part that makes hiding the login
 * page mean something. A single-page app cannot hide a route from anyone
 * willing to read its bundle, so the route is not what refuses; this is.
 *
 * Note what this deliberately is not: it is not a credential. It carries no
 * subject, grants no access on its own, and the two verifiers above already
 * refuse it without needing to know it exists — `verifySessionToken` rejects
 * any scoped token, `verifyMediaToken` demands `media` specifically.
 */
export function signUnlockTicket(): string {
  return jwt.sign({ scope: UNLOCK_SCOPE }, config.jwtSecret, {
    expiresIn: config.unlockTicketTtl,
  } as jwt.SignOptions);
}

/** Throws unless the token is a live, correctly-signed unlock ticket. */
export function verifyUnlockTicket(token: string): void {
  const payload = jwt.verify(token, config.jwtSecret) as jwt.JwtPayload;

  if (payload.scope !== UNLOCK_SCOPE) {
    throw new Error('Not an unlock ticket');
  }
}

/** Expiry of an already-signed token, in epoch milliseconds. */
export function tokenExpiresAt(token: string): number {
  const payload = jwt.decode(token) as jwt.JwtPayload | null;
  if (!payload?.exp) {
    throw new Error('Token has no expiry');
  }
  return payload.exp * 1000;
}
