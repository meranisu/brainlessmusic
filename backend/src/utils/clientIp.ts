import type { FastifyRequest } from 'fastify';
import { config } from '../config.js';

/**
 * The address a rate limiter should count against: the configured proxy
 * header when one is set and present (see `config.clientIpHeader`), otherwise
 * the socket address. A request missing the header falls back rather than
 * failing, so a direct LAN request still gets a window of its own.
 */
export function clientIp(request: FastifyRequest): string {
  const header = config.clientIpHeader;
  if (header) {
    const value = request.headers[header];
    if (typeof value === 'string' && value.trim() !== '') return value.trim();
  }
  return request.ip;
}
