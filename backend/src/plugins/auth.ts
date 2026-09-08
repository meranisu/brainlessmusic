import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { findUserById } from '../db/users.js';
import { verifyMediaToken, verifySessionToken } from '../services/token.js';

export interface AuthUser {
  id: number;
  username: string;
}

declare module 'fastify' {
  interface FastifyInstance {
    authenticate(request: FastifyRequest, reply: FastifyReply): Promise<void>;
    authenticateMedia(request: FastifyRequest, reply: FastifyReply): Promise<void>;
    requireAdmin(request: FastifyRequest, reply: FastifyReply): Promise<void>;
  }
  interface FastifyRequest {
    user?: AuthUser;
  }
}

function bearerFrom(request: FastifyRequest): string | undefined {
  const header = request.headers.authorization;
  return header?.startsWith('Bearer ') ? header.slice('Bearer '.length) : undefined;
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
  });

  // For endpoints a browser element loads by URL alone (`<audio src>`, and
  // cover art later). Accepts a normal bearer header first — that's what the
  // Android client and curl use — and falls back to a `?token=` media token,
  // which is the only credential type allowed to travel in a URL.
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
  });

  // Runs after `authenticate` (composed as [authenticate, requireAdmin] in
  // route preHandlers) — re-reads is_admin from the DB rather than trusting
  // the JWT payload, so a role revoked mid-session takes effect immediately
  // instead of waiting for the token to expire.
  app.decorate('requireAdmin', async (request: FastifyRequest, reply: FastifyReply) => {
    const user = request.user && findUserById(request.user.id);
    if (!user?.is_admin) {
      return reply.code(403).send({ error: 'Admin access required' });
    }
  });
}
