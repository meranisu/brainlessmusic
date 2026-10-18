import { BlockList, isIP } from 'node:net';
import type { FastifyRequest } from 'fastify';
import { config } from '../config.js';

/** Peers a reverse proxy runs on: loopback, private ranges and docker bridges. Anyone else can't vouch for a header. */
const proxyPeers = new BlockList();
proxyPeers.addSubnet('127.0.0.0', 8);
proxyPeers.addSubnet('10.0.0.0', 8);
proxyPeers.addSubnet('172.16.0.0', 12);
proxyPeers.addSubnet('192.168.0.0', 16);
proxyPeers.addSubnet('100.64.0.0', 10);
proxyPeers.addAddress('::1', 'ipv6');
proxyPeers.addSubnet('fc00::', 7, 'ipv6');

function isProxyPeer(address: string): boolean {
  const v4 = address.startsWith('::ffff:') ? address.slice(7) : address;
  const family = isIP(v4);
  return family !== 0 && proxyPeers.check(v4, family === 6 ? 'ipv6' : 'ipv4');
}

/**
 * The rate-limit key: the configured proxy header if present (`config.clientIpHeader`), else the socket address.
 * The header is only believed when the connection itself comes from a local or private peer, so a client reaching the
 * port directly can't rotate it to dodge the limiters.
 */
export function clientIp(request: FastifyRequest): string {
  const header = config.clientIpHeader;
  if (header && isProxyPeer(request.ip)) {
    const value = request.headers[header];
    if (typeof value === 'string' && value.trim() !== '') return value.trim();
  }
  return request.ip;
}
