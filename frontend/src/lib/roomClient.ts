import { getToken } from './apiClient';

/**
 * The live half of room sync ("Listen together", A102): one WebSocket to `/api/rooms/ws`, the server's clock, and
 * reconnecting. No React here; `RoomProvider` wraps it. Protocol and timings: `.docs/specs/room-sync.md`.
 */

export interface RoomEntry {
  entryId: number;
  trackId: number;
  title: string;
  artist: string | null;
  albumId: number | null;
  durationMs: number;
  addedBy: number;
}

export interface RoomMember {
  userId: number;
  name: string;
  kind: 'account' | 'guest';
  connected: boolean;
}

export interface RoomState {
  code: string;
  version: number;
  hostUserId: number;
  members: RoomMember[];
  queue: RoomEntry[];
  current: number;
  /** While playing, the song is at `positionMs + (serverNow - anchorMs)`; before `anchorMs` it hasn't started. */
  playback: { playing: boolean; positionMs: number; anchorMs: number };
}

export type RoomCommand =
  | { op: 'play' }
  | { op: 'pause' }
  | { op: 'seek'; entryId: number; positionMs: number }
  | { op: 'next'; entryId: number }
  | { op: 'previous'; entryId: number }
  | { op: 'jump'; entryId: number }
  | { op: 'add'; trackIds: number[]; after?: number }
  | { op: 'remove'; entryId: number }
  | { op: 'move'; entryId: number; toIndex: number }
  | { op: 'end' }
  | { op: 'kick'; userId: number };

/** `live`: in step. `connecting`: first connect or a reconnect after a drop; the music carries on meanwhile. */
export type Connection = 'connecting' | 'live';

/** Why the server let go of us. `left` covers our own leave and being dropped after the away grace. */
export type ClosedReason = 'ended' | 'kicked' | 'not-found' | 'replaced' | 'left' | 'full' | 'unauthorized';

export interface RoomClientEvents {
  /** `you` comes with the first state after each (re)connect. */
  onState(room: RoomState, you?: number): void;
  onConnection(connection: Connection): void;
  /** Final: the client has stopped and won't reconnect. */
  onClosed(reason: ClosedReason): void;
  onRejected(op: string, reason: string): void;
}

const SYNC_PINGS = 8;
const SYNC_PING_GAP_MS = 100;
/**
 * The burst runs while the page is busy loading, which delays handling the replies and skews the estimate (measured:
 * 0.5 s off). So pings stay frequent for the first half minute, giving quieter samples to replace those.
 */
const EARLY_PING_EVERY_MS = 3000;
const EARLY_PHASE_MS = 30_000;
/** Also keeps the socket inside Cloudflare's ~100 s idle limit. */
const PING_EVERY_MS = 20_000;
/** The offset is the median of the lowest-round-trip samples in this window, so one slow reply can't move it. */
const RTT_WINDOW_MS = 120_000;
const BEST_SAMPLES = 3;
const RECONNECT_STEPS_MS = [1000, 2000, 4000, 8000, 10_000];
/** A drop isn't noticed until a ping goes unanswered, so give up on the socket after this long silent. */
const SILENT_LIMIT_MS = PING_EVERY_MS + 10_000;

function wsUrl(): string {
  const base = import.meta.env.VITE_API_BASE_URL ?? '/api';
  const absolute = new URL(`${base}/rooms/ws`, window.location.href);
  absolute.protocol = absolute.protocol === 'https:' ? 'wss:' : 'ws:';
  return absolute.toString();
}

export class RoomClient {
  private socket: WebSocket | null = null;
  private stopped = false;
  private attempt = 0;
  private reconnectTimer: number | undefined;
  private pingTimer: number | undefined;
  private syncTimers: number[] = [];
  private lastHeard = 0;
  private cmdCounter = 0;
  private readonly pendingOps = new Map<string, string>();
  /** `serverClock - performance.now()`, from the lowest round trips seen. */
  private offset = 0;
  private hasOffset = false;
  private samples: { rtt: number; offset: number; at: number }[] = [];
  private readonly code: string;
  private readonly events: RoomClientEvents;

  /** Doesn't connect: call `connect()` once the caller holds the instance, since events fire from inside it. */
  constructor(code: string, events: RoomClientEvents) {
    this.code = code;
    this.events = events;
  }

  connect(): void {
    this.open();
  }

  /** The server clock now, in ms. Monotonic: the computer's own clock changing mid-session doesn't move it. */
  serverNow(): number {
    return performance.now() + this.offset;
  }

  get synced(): boolean {
    return this.hasOffset;
  }

  send(command: RoomCommand): void {
    if (this.socket?.readyState !== WebSocket.OPEN) return;
    const clientCmdId = `c${++this.cmdCounter}`;
    this.pendingOps.set(clientCmdId, command.op);
    this.socket.send(JSON.stringify({ type: 'cmd', clientCmdId, ...command }));
  }

  status(driftMs: number | null, buffering: boolean): void {
    if (this.socket?.readyState !== WebSocket.OPEN) return;
    this.socket.send(JSON.stringify({ type: 'status', driftMs, buffering }));
  }

  /** Leaves the room for good. */
  leave(): void {
    if (this.socket?.readyState === WebSocket.OPEN) this.socket.send(JSON.stringify({ type: 'leave' }));
    this.stop();
  }

  /** Stops without telling the server, e.g. on sign-out; the server marks us away and drops us after the grace. */
  stop(): void {
    this.stopped = true;
    this.clearTimers();
    const socket = this.socket;
    this.socket = null;
    socket?.close();
  }

  private clearTimers(): void {
    window.clearTimeout(this.reconnectTimer);
    window.clearTimeout(this.pingTimer);
    for (const t of this.syncTimers) window.clearTimeout(t);
    this.syncTimers = [];
  }

  private open(): void {
    if (this.stopped) return;
    this.events.onConnection('connecting');
    const socket = new WebSocket(wsUrl());
    this.socket = socket;

    socket.onopen = () => {
      socket.send(JSON.stringify({ type: 'hello', token: getToken(), code: this.code }));
    };
    socket.onmessage = (event) => {
      if (socket !== this.socket) return;
      this.lastHeard = performance.now();
      let message: { type: string; [key: string]: unknown };
      try {
        message = JSON.parse(String(event.data));
      } catch {
        return;
      }
      this.handle(message);
    };
    socket.onclose = () => {
      if (socket !== this.socket) return;
      this.socket = null;
      this.clearTimers();
      this.scheduleReconnect();
    };
  }

  private handle(message: { type: string; [key: string]: unknown }): void {
    switch (message.type) {
      case 'welcome': {
        this.attempt = 0;
        this.startClockSync();
        this.events.onState(message.room as RoomState, message.you as number);
        // `live` once the first burst of pings settles the clock; until then positions would be guesses.
        return;
      }
      case 'state':
        this.events.onState(message.room as RoomState);
        return;
      case 'pong':
        this.takeSample(message.t0 as number, message.ts as number);
        return;
      case 'rejected': {
        const id = String(message.clientCmdId);
        const op = this.pendingOps.get(id) ?? 'command';
        this.pendingOps.delete(id);
        this.events.onRejected(op, String(message.reason));
        return;
      }
      case 'closed': {
        this.stopped = true;
        this.clearTimers();
        this.events.onClosed(message.reason as ClosedReason);
        return;
      }
    }
  }

  /** 8 quick pings on every (re)connect, one every 3 s for half a minute, then one every 20 s (spec, "Clock sync"). */
  private startClockSync(): void {
    this.samples = [];
    for (let i = 0; i < SYNC_PINGS; i++) {
      this.syncTimers.push(window.setTimeout(() => this.ping(), i * SYNC_PING_GAP_MS));
    }
    this.syncTimers.push(
      window.setTimeout(() => this.events.onConnection('live'), SYNC_PINGS * SYNC_PING_GAP_MS + 200),
    );
    const startedAt = performance.now();
    const tick = () => {
      if (performance.now() - this.lastHeard > SILENT_LIMIT_MS) {
        // Half-open: no close event will come, so drop it ourselves and reconnect.
        this.socket?.close();
        return;
      }
      this.ping();
      const early = performance.now() - startedAt < EARLY_PHASE_MS;
      this.pingTimer = window.setTimeout(tick, early ? EARLY_PING_EVERY_MS : PING_EVERY_MS);
    };
    this.pingTimer = window.setTimeout(tick, EARLY_PING_EVERY_MS);
  }

  private ping(): void {
    if (this.socket?.readyState !== WebSocket.OPEN) return;
    this.socket.send(JSON.stringify({ type: 'ping', t0: performance.now() }));
  }

  /**
   * NTP's estimate: the server's time was `ts` halfway through the round trip. A reply handled late (busy page, slow
   * network) inflates its round trip, so only the quickest few samples count.
   */
  private takeSample(t0: number, serverTs: number): void {
    const t1 = performance.now();
    const sample = { rtt: t1 - t0, offset: serverTs - (t0 + t1) / 2, at: t1 };
    this.samples = [...this.samples.filter((s) => t1 - s.at < RTT_WINDOW_MS), sample];
    const best = [...this.samples].sort((a, b) => a.rtt - b.rtt).slice(0, BEST_SAMPLES);
    const offsets = best.map((s) => s.offset).sort((a, b) => a - b);
    this.offset = offsets[Math.floor(offsets.length / 2)];
    this.hasOffset = true;
  }

  private scheduleReconnect(): void {
    if (this.stopped) return;
    this.events.onConnection('connecting');
    const delay = RECONNECT_STEPS_MS[Math.min(this.attempt, RECONNECT_STEPS_MS.length - 1)];
    this.attempt += 1;
    this.reconnectTimer = window.setTimeout(() => this.open(), delay);
  }
}

/** Where the room's song is now, in ms on the server clock; negative before a new song's start time. */
export function expectedPositionMs(room: RoomState, serverNow: number): number {
  const { playing, positionMs, anchorMs } = room.playback;
  return playing ? positionMs + (serverNow - anchorMs) : positionMs;
}
