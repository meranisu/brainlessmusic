import type { FastifyReply } from 'fastify';
import type { RateLimitResult } from '../services/rateLimit.js';

/** 429 with `Retry-After` taken from a refused rate-limit result. */
export function replyRateLimited(reply: FastifyReply, rate: Pick<RateLimitResult, 'retryAfterSeconds'>, error: string) {
  return reply.code(429).header('retry-after', String(rate.retryAfterSeconds)).send({ error });
}
