export interface StreamErrorEntry {
  timestamp: string;
  trackId: number;
  message: string;
}

export interface HealthSnapshot {
  status: 'ok' | 'degraded';
  uptimeSeconds: number;
  activeStreams: number;
  recentErrors: StreamErrorEntry[];
}

const MAX_RECENT_ERRORS = 20;
const RECENT_ERRORS_RETURNED = 10;

const startedAt = Date.now();
let activeStreams = 0;
const recentErrors: StreamErrorEntry[] = [];

export function streamStarted(): void {
  activeStreams++;
}

export function streamEnded(): void {
  activeStreams = Math.max(0, activeStreams - 1);
}

export function recordStreamError(trackId: number, message: string): void {
  recentErrors.unshift({ timestamp: new Date().toISOString(), trackId, message });
  recentErrors.length = Math.min(recentErrors.length, MAX_RECENT_ERRORS);
}

export function getHealthSnapshot(): HealthSnapshot {
  return {
    status: recentErrors.length > 0 ? 'degraded' : 'ok',
    uptimeSeconds: Math.floor((Date.now() - startedAt) / 1000),
    activeStreams,
    recentErrors: recentErrors.slice(0, RECENT_ERRORS_RETURNED),
  };
}
