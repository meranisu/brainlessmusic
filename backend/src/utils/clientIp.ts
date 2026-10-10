import type { FastifyRequest } from 'fastify';
import { config } from '../config.js';

/** The rate-limit key: the configured proxy header if present (`config.clientIpHeader`), else the socket address. */
export function clientIp(request: FastifyRequest): string {
  const header = config.clientIpHeader;
  if (header) {
    const value = request.headers[header];
    if (typeof value === 'string' && value.trim() !== '') return value.trim();
  }
  return request.ip;
}
