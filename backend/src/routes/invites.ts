import type { FastifyPluginAsync } from 'fastify';
import { acceptInvite, createInvite, listInvites, peekInvite, revokeInvite } from '../db/invites.js';
import { hashPassword } from '../services/password.js';
import { createRateLimiter } from '../services/rateLimit.js';
import { signToken } from '../services/token.js';
import { clientIp } from '../utils/clientIp.js';
import { MIN_PASSWORD_LENGTH, usernameProblem } from './auth.js';

const HOUR_MS = 60 * 60 * 1000;
/** Accept attempts per address per hour. The token is 192 random bits, so this is about bcrypt cost, not guessing. */
const ACCEPTS_PER_HOUR = 20;

const acceptLimiter = createRateLimiter();

/**
 * Account invites (A107-A112). The admin makes a one-use link from the Users page; the friend opens it signed out and
 * picks a name and password. An invite tied to a guest turns that guest into an account.
 */
const invitesRoute: FastifyPluginAsync = async (fastify) => {
  const adminOnly = { preHandler: [fastify.authenticate, fastify.requireAdmin] };

  // The raw token is in this response only; the link is built by the client from its own origin.
  fastify.post<{ Body: { guestUserId?: unknown } }>('/admin/invites', adminOnly, async (request, reply) => {
    const guestUserId = request.body?.guestUserId ?? null;
    if (guestUserId !== null && !Number.isInteger(guestUserId)) {
      return reply.code(400).send({ error: 'guestUserId must be a user id' });
    }

    const created = createInvite(request.user!.id, guestUserId as number | null);
    if (!created) return reply.code(404).send({ error: 'Guest not found' });

    return reply.code(201).send({ id: created.invite.id, token: created.token, expiresAt: created.invite.expires_at });
  });

  fastify.get('/admin/invites', adminOnly, async (_request, reply) => {
    return reply.send({ invites: listInvites() });
  });

  fastify.delete<{ Params: { id: string } }>('/admin/invites/:id', adminOnly, async (request, reply) => {
    const id = Number(request.params.id);
    if (!Number.isInteger(id) || !revokeInvite(id)) {
      return reply.code(404).send({ error: 'Invite not found or already closed' });
    }
    return reply.code(204).send();
  });

  /** For the accept page. 404 only for a token never issued; used, expired and revoked come back as a status. */
  fastify.get<{ Params: { token: string } }>('/invites/:token', async (request, reply) => {
    const peek = peekInvite(request.params.token);
    if (!peek) return reply.code(404).send({ error: 'Invite not found' });
    return reply.send(peek);
  });

  fastify.post<{ Params: { token: string }; Body: { username?: unknown; password?: unknown } }>(
    '/invites/:token/accept',
    async (request, reply) => {
      const rate = acceptLimiter.check(clientIp(request), { limit: ACCEPTS_PER_HOUR, windowMs: HOUR_MS });
      if (!rate.allowed) {
        return reply
          .code(429)
          .header('retry-after', String(rate.retryAfterSeconds))
          .send({ error: 'Too many tries. Wait a moment.' });
      }

      const { username, password } = request.body ?? {};
      if (typeof username !== 'string' || typeof password !== 'string' || !username || !password) {
        return reply.code(400).send({ error: 'username and password are required' });
      }

      const problem = usernameProblem(username);
      if (problem) return reply.code(400).send({ error: problem });

      if (password.length < MIN_PASSWORD_LENGTH) {
        return reply.code(400).send({ error: `password must be at least ${MIN_PASSWORD_LENGTH} characters` });
      }

      // Refuse a dead link before paying for bcrypt.
      if (peekInvite(request.params.token)?.status !== 'open') {
        return reply.code(410).send({ error: 'This invite link has expired or was already used' });
      }

      const outcome = acceptInvite(request.params.token, username, await hashPassword(password));
      if (!outcome.ok) {
        return outcome.reason === 'taken'
          ? reply.code(409).send({ error: 'username already taken' })
          : reply.code(410).send({ error: 'This invite link has expired or was already used' });
      }

      const { user, upgraded } = outcome;
      request.log.info(`${upgraded ? 'Upgraded a guest to' : 'Created'} account ${user.username} from an invite`);
      return reply.code(201).send({
        token: signToken({ id: user.id, username: user.username, sessionVersion: user.session_version }),
        username: user.username,
        upgraded,
      });
    },
  );
};

export default invitesRoute;
