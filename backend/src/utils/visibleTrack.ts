import type { FastifyRequest } from 'fastify';
import { findTrackById, type TrackRow } from '../db/library.js';
import { isAdminRequest } from './isAdmin.js';

/** The track, or undefined when it is missing or hidden from this caller: a hidden track doesn't exist for a non-admin (A34). */
export function findVisibleTrack(id: number, request: FastifyRequest): TrackRow | undefined {
  const track = findTrackById(id);
  if (!track || (track.hidden && !isAdminRequest(request))) return undefined;
  return track;
}
