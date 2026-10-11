import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { findUserById } from '../db/users.js';
import { verifyMediaToken, verifySessionToken } from '../services/token.js';

export interface AuthUser {
  id: number;
  username: string;
  /** The `session_version` the token was signed with. */
  sessionVersion?: number;
}

declare module 'fastify' {
  interface FastifyInstance {
    authenticate(request: FastifyRequest, reply: FastifyReply): Promise<void>;
    authenticateMedia(request: FastifyRequest, reply: FastifyReply): Promise<void>;
    requireAdmin(request: FastifyRequest, reply: FastifyReply): Promise<void>;
    requireAccount(request: FastifyRequest, reply: FastifyReply): Promise<void>;
  }
  interface FastifyRequest {
    user?: AuthUser;
  }
}

function bearerFrom(request: FastifyRequest): string | undefined {
  const header = request.headers.authorization;
  return header?.startsWith('Bearer ') ? header.slice('Bearer '.length) : undefined;
}

/**
 * A valid signature doesn't mean the session still stands: a deleted or pruned user, or a password changed since the
 * token was signed (C8), is refused before the token expires.
 */
function rejectStaleSession(request: FastifyRequest, reply: FastifyReply): FastifyReply | undefined {
  const user = findUserById(request.user!.id);
  if (!user || user.session_version !== (request.user!.sessionVersion ?? 0)) {
    request.user = undefined;
    return reply.code(401).send({ error: 'Invalid or expired token' });
  }
  return undefined;
}

export function registerAuthDecorator(app: FastifyInstance): void {
  app.decorate('authenticate', async (request: FastifyRequest, reply: FastifyReply) => {
    const token = bearerFrom(request);

    if (!token) {
      return reply.code(401).send({ error: 'Missing bearer token' });
    }

    try {
      request.user = verifySessionToken(token);
    } catch {
      return reply.code(401).send({ error: 'Invalid or expired token' });
    }

    return rejectStaleSession(request, reply);
  });

  // For URLs a browser element loads (`<audio src>`, cover art): a bearer header first, else a `?token=` media token,
  // the only credential allowed in a URL.
  app.decorate('authenticateMedia', async (request: FastifyRequest, reply: FastifyReply) => {
    const bearer = bearerFrom(request);
    const query = request.query as { token?: unknown } | undefined;
    const mediaToken = typeof query?.token === 'string' ? query.token : undefined;

    if (!bearer && !mediaToken) {
      return reply.code(401).send({ error: 'Missing bearer token or media token' });
    }

    try {
      request.user = bearer ? verifySessionToken(bearer) : verifyMediaToken(mediaToken!);
    } catch {
      return reply.code(401).send({ error: 'Invalid or expired token' });
    }

    return rejectStaleSession(request, reply);
  });

  // Runs after `authenticate` and re-reads is_admin, so a revoked role applies at once.
  app.decorate('requireAdmin', async (request: FastifyRequest, reply: FastifyReply) => {
    const user = request.user && findUserById(request.user.id);
    if (!user?.is_admin) {
      return reply.code(403).send({ error: 'Admin access required' });
    }
  });

  // Guests are listen-only (A37): playlists, favorites, play counts and history need an account. Runs after
  // `authenticate` and re-reads the row.
  app.decorate('requireAccount', async (request: FastifyRequest, reply: FastifyReply) => {
    const user = request.user && findUserById(request.user.id);
    if (!user || user.kind === 'guest') {
      return reply.code(403).send({ error: "Guests can't do that" });
    }
  });
}
