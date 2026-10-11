import type { FastifyRequest } from 'fastify';
import { findUserById } from '../db/users.js';

/**
 * Whether the signed-in caller is an admin, re-read like `requireAdmin` so a revoked role applies at once. For routes
 * open to everyone that show an admin more, such as hidden tracks (A34). Call only after `authenticate`.
 */
export function isAdminRequest(request: FastifyRequest): boolean {
  return Boolean(findUserById(request.user!.id)?.is_admin);
}
