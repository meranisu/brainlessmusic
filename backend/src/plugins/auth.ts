import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import { findUserById } from '../db/users.js';

export interface AuthUser {
  id: number;
  username: string;
}

declare module 'fastify' {
  interface FastifyInstance {
    authenticate(request: FastifyRequest, reply: FastifyReply): Promise<void>;
    requireAdmin(request: FastifyRequest, reply: FastifyReply): Promise<void>;
  }
  interface FastifyRequest {
    user?: AuthUser;
  }
}

export function registerAuthDecorator(app: FastifyInstance): void {
  app.decorate('authenticate', async (request: FastifyRequest, reply: FastifyReply) => {
    const header = request.headers.authorization;
    const token = header?.startsWith('Bearer ') ? header.slice('Bearer '.length) : undefined;

    if (!token) {
      return reply.code(401).send({ error: 'Missing bearer token' });
    }

    try {
      const payload = jwt.verify(token, config.jwtSecret) as jwt.JwtPayload;
      request.user = { id: Number(payload.sub), username: payload.username as string };
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
