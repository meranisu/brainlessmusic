import type { FastifyPluginAsync } from 'fastify';
import { config } from '../config.js';
import {
  approveGuestCodeRequest,
  denyGuestCodeRequest,
  listPendingRequests,
} from '../db/guestCodeRequests.js';
import { countGuests, pruneIdleGuests } from '../db/users.js';
import {
  createGuestCode,
  deleteGuestCode,
  guestCodesRequired,
  listGuestCodes,
  setGuestCodesRequired,
} from '../db/guestCodes.js';

/** The admin "Guest access" panel (A42/A43, A67-A69). `ENTRY_CODE` is reported as set or not, never returned. */
const guestCodesRoute: FastifyPluginAsync = async (fastify) => {
  const adminOnly = { preHandler: [fastify.authenticate, fastify.requireAdmin] };

  function snapshot() {
    return {
      required: guestCodesRequired(),
      sharedCodeSet: config.entryCode !== '',
      codes: listGuestCodes(),
      requests: listPendingRequests(),
    };
  }

  fastify.get('/guest-codes', adminOnly, async (_request, reply) => {
    return reply.send(snapshot());
  });

  fastify.put<{ Body: { required?: unknown } }>('/guest-codes/settings', adminOnly, async (request, reply) => {
    const required = request.body?.required;
    if (typeof required !== 'boolean') {
      return reply.code(400).send({ error: '`required` must be true or false' });
    }

    setGuestCodesRequired(required);
    return reply.send(snapshot());
  });

  fastify.post('/guest-codes', adminOnly, async (request, reply) => {
    const row = createGuestCode(request.user!.id);
    const listing = listGuestCodes().find((code) => code.id === row.id)!;
    return reply.code(201).send(listing);
  });

  // Approving mints the guest, so it counts against the cap like the guest door does.
  fastify.post<{ Params: { id: string } }>('/guest-codes/requests/:id/approve', adminOnly, async (request, reply) => {
    const id = Number(request.params.id);
    if (!Number.isInteger(id)) return reply.code(404).send({ error: 'Request not found' });

    if (countGuests() >= config.maxGuests) pruneIdleGuests(config.guestIdleDays);
    if (countGuests() >= config.maxGuests) {
      return reply.code(503).send({ error: 'The server is full of guests. Revoke one first.' });
    }

    if (!approveGuestCodeRequest(id, request.user!.id)) {
      return reply.code(404).send({ error: 'Request not found' });
    }
    return reply.send(snapshot());
  });

  fastify.post<{ Params: { id: string } }>('/guest-codes/requests/:id/deny', adminOnly, async (request, reply) => {
    const id = Number(request.params.id);
    if (!Number.isInteger(id) || !denyGuestCodeRequest(id)) {
      return reply.code(404).send({ error: 'Request not found' });
    }
    return reply.send(snapshot());
  });

  // On a used code this revokes it: the guest and its data go, and every device using it is signed out (A69).
  fastify.delete<{ Params: { id: string } }>('/guest-codes/:id', adminOnly, async (request, reply) => {
    const id = Number(request.params.id);
    if (!Number.isInteger(id) || !deleteGuestCode(id)) {
      return reply.code(404).send({ error: 'Code not found' });
    }
    return reply.code(204).send();
  });
};

export default guestCodesRoute;
