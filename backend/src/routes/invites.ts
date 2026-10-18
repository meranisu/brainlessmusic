import type { FastifyPluginAsync } from 'fastify';
import { acceptInvite, createInvite, listInvites, peekInvite, revokeInvite } from '../db/invites.js';
import { cleanEmail } from '../db/users.js';
import { hashPasscode, hashPassword } from '../services/password.js';
import { createRateLimiter } from '../services/rateLimit.js';
import { signToken } from '../services/token.js';
import { clientIp } from '../utils/clientIp.js';
import { MIN_PASSWORD_LENGTH, PASSCODE_PATTERN, usernameProblem } from './auth.js';
import { parseId } from '../utils/parseId.js';
import { replyRateLimited } from '../utils/replyRateLimited.js';

const HOUR_MS = 60 * 60 * 1000;
/** Accept attempts per address per hour; mostly about bcrypt cost. */
const ACCEPTS_PER_HOUR = 20;
/**
 * Code checks per address per hour. Codes are 8 characters from 31 (A191), about 40 bits, so at this rate guessing one
 * of a handful of open invites before it expires is out of reach.
 */
const PEEKS_PER_HOUR = 30;

const acceptLimiter = createRateLimiter();
const peekLimiter = createRateLimiter();

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
    const id = parseId(request.params.id);
    if (id === undefined || !revokeInvite(id)) {
      return reply.code(404).send({ error: 'Invite not found or already closed' });
    }
    return reply.code(204).send();
  });

  /** For the accept page. 404 only for a token never issued; used, expired and revoked come back as a status. */
  fastify.get<{ Params: { token: string } }>('/invites/:token', async (request, reply) => {
    const rate = peekLimiter.check(clientIp(request), { limit: PEEKS_PER_HOUR, windowMs: HOUR_MS });
    if (!rate.allowed) {
      return replyRateLimited(reply, rate, 'Too many tries. Wait a moment.');
    }
    const peek = peekInvite(request.params.token);
    if (!peek) return reply.code(404).send({ error: 'Invite not found' });
    return reply.send(peek);
  });

  fastify.post<{
    Params: { token: string };
    Body: { username?: unknown; password?: unknown; email?: unknown; passcode?: unknown };
  }>(
    '/invites/:token/accept',
    async (request, reply) => {
      const rate = acceptLimiter.check(clientIp(request), { limit: ACCEPTS_PER_HOUR, windowMs: HOUR_MS });
      if (!rate.allowed) {
        return replyRateLimited(reply, rate, 'Too many tries. Wait a moment.');
      }

      const { username, password, passcode } = request.body ?? {};
      if (typeof username !== 'string' || typeof password !== 'string' || !username || !password) {
        return reply.code(400).send({ error: 'username and password are required' });
      }

      const problem = usernameProblem(username);
      if (problem) return reply.code(400).send({ error: problem });

      if (password.length < MIN_PASSWORD_LENGTH) {
        return reply.code(400).send({ error: `password must be at least ${MIN_PASSWORD_LENGTH} characters` });
      }

      // Required on sign-up (A190).
      const email = cleanEmail(request.body?.email);
      if (email === undefined) return reply.code(400).send({ error: 'enter a valid email' });

      // Optional: empty or missing means none.
      if (passcode !== undefined && passcode !== null && passcode !== '') {
        if (typeof passcode !== 'string' || !PASSCODE_PATTERN.test(passcode)) {
          return reply.code(400).send({ error: 'passcode must be 4-8 digits' });
        }
      }

      // Refuse a dead link before paying for bcrypt.
      if (peekInvite(request.params.token)?.status !== 'open') {
        return reply.code(410).send({ error: 'This invite link has expired or was already used' });
      }

      const outcome = acceptInvite(request.params.token, {
        username,
        email,
        passwordHash: await hashPassword(password),
        passcodeHash: typeof passcode === 'string' && passcode !== '' ? await hashPasscode(passcode) : null,
      });
      if (!outcome.ok) {
        if (outcome.reason === 'taken') return reply.code(409).send({ error: 'username already taken' });
        if (outcome.reason === 'emailTaken') return reply.code(409).send({ error: 'that email is already in use' });
        return reply.code(410).send({ error: 'This invite link has expired or was already used' });
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
