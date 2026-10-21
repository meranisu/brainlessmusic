import { apiClient, getToken, reportRoomIssue } from './apiClient';

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
  gainDb: number | null;
  addedBy: number;
  /** Who added it, kept on the entry so it still shows after they leave (A256). Missing from an older server. */
  addedByName?: string;
  addedByAvatarId?: string | null;
}

/** The host's choices for the room (A253). The host is never held back; `'host'` means only the host. */
export interface RoomSettings {
  shuffle: boolean;
  repeat: 'off' | 'all' | 'one';
  turns: boolean;
  skip: 'vote' | 'everyone' | 'host';
  playback: 'everyone' | 'host';
  add: 'everyone' | 'host';
  /** Moving and removing other people's songs; your own you always can. */
  editQueue: 'everyone' | 'host';
  invite: 'everyone' | 'host';
}

export interface RoomMember {
  userId: number;
  name: string;
  kind: 'account' | 'guest';
  /** Their profile picture; null without one and for guests. Missing from a server older than it. */
  avatarId?: string | null;
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
  /** Missing from a server older than them. */
  settings?: RoomSettings;
  skipVote?: { entryId: number; votes: number[]; needed: number } | null;
}

/** Whether `you` may do something the room's settings can limit. Fine on an older server, which has no settings. */
export function roomAllows(
  room: RoomState,
  you: number | null,
  area: 'playback' | 'add' | 'editQueue' | 'invite',
): boolean {
  return room.hostUserId === you || !room.settings || room.settings[area] === 'everyone';
}

/** What Next does for `you` right now: skip at once, add a vote, or nothing (A254). */
export function roomNextAction(room: RoomState, you: number | null): 'skip' | 'vote' | 'blocked' {
  const playing = room.queue[room.current];
  const skip = room.settings?.skip ?? 'everyone';
  if (room.hostUserId === you || skip === 'everyone' || playing?.addedBy === you) return 'skip';
  return skip === 'vote' ? 'vote' : 'blocked';
}

/** The Next button's label in a room: "Vote to skip (1 of 2)" while a vote is going. */
export function roomNextLabel(room: RoomState, you: number | null): string {
  const action = roomNextAction(room, you);
  if (action === 'skip') return 'Next track';
  if (action === 'blocked') return 'Only the host can skip';
  const vote = room.skipVote;
  const playing = room.queue[room.current];
  if (vote && playing && vote.entryId === playing.entryId) {
    const voted = you !== null && vote.votes.includes(you);
    return `${voted ? 'You voted to skip' : 'Vote to skip'} (${vote.votes.length} of ${vote.needed})`;
  }
  return 'Vote to skip';
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
  | { op: 'kick'; userId: number }
  | { op: 'settings'; settings: Partial<RoomSettings> };

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
/** Drops in a row (no welcome between) before the room issue log hears about it. */
const DROPS_WORTH_REPORTING = 3;
/** Ways a room ends that are someone's choice, not a fault; the rest go to the room issue log. */
const NORMAL_CLOSES = new Set(['ended', 'kicked', 'not-found', 'replaced', 'left', 'full']);
/** A drop isn't noticed until a ping goes unanswered, so give up on the socket after this long silent. */
const SILENT_LIMIT_MS = PING_EVERY_MS + 10_000;
/** Ops remembered for naming a rejection. Accepted commands get no reply, so only the newest few are kept. */
const PENDING_OPS_KEPT = 50;

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
  /** The burst is over but no pong has come back yet: `live` waits for the first one. */
  private liveOnFirstSample = false;
  private samples: { rtt: number; offset: number; at: number }[] = [];
  /** `welcome` arrived on the current socket; the server takes nothing but `hello` before it. */
  private joined = false;
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
    if (this.pendingOps.size > PENDING_OPS_KEPT) this.pendingOps.delete(this.pendingOps.keys().next().value!);
    this.socket.send(JSON.stringify({ type: 'cmd', clientCmdId, ...command }));
  }

  status(driftMs: number | null, buffering: boolean): void {
    if (this.socket?.readyState !== WebSocket.OPEN) return;
    this.socket.send(JSON.stringify({ type: 'status', driftMs, buffering }));
  }

  /**
   * Leaves the room for good. With the socket down (reconnecting) the leave goes over REST instead, or the server would
   * keep us for its away grace and a reload would put us straight back in.
   */
  leave(): void {
    if (this.socket?.readyState === WebSocket.OPEN && this.joined) {
      this.socket.send(JSON.stringify({ type: 'leave' }));
    } else {
      void apiClient.post('/rooms/leave', {}).catch((error) => {
        // Unreachable: the server drops us after its grace period anyway.
        reportRoomIssue('request-failed', "Couldn't leave the room over REST", { error, roomCode: this.code });
      });
    }
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
      } catch (error) {
        reportRoomIssue('parse-failed', 'Room message is not JSON', {
          detail: `${error instanceof Error ? error.message : error}: ${String(event.data).slice(0, 300)}`,
          roomCode: this.code,
        });
        return;
      }
      this.handle(message);
    };
    socket.onclose = (event) => {
      if (socket !== this.socket) return;
      // One drop is a network blip; three in a row without a welcome is worth a look.
      if (this.attempt + 1 === DROPS_WORTH_REPORTING) {
        reportRoomIssue('socket-closed', `Room socket dropped ${DROPS_WORTH_REPORTING} times in a row`, {
          detail: `last close ${event.code}${event.reason ? ` ${event.reason}` : ''}`,
          roomCode: this.code,
        });
      }
      this.socket = null;
      this.joined = false;
      this.clearTimers();
      this.scheduleReconnect();
    };
  }

  private handle(message: { type: string; [key: string]: unknown }): void {
    switch (message.type) {
      case 'welcome': {
        this.attempt = 0;
        this.joined = true;
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
      case 'error':
        reportRoomIssue('server-error', 'Server refused a room message', {
          detail: String(message.reason),
          roomCode: this.code,
        });
        return;
      case 'closed': {
        if (!NORMAL_CLOSES.has(String(message.reason))) {
          reportRoomIssue('server-closed', 'Server closed the room socket', {
            detail: String(message.reason),
            roomCode: this.code,
          });
        }
        this.stopped = true;
        this.clearTimers();
        // Detach first so the close below can't reach the reconnect path.
        const socket = this.socket;
        this.socket = null;
        this.joined = false;
        if (socket) {
          socket.onmessage = null;
          socket.onclose = null;
          socket.close();
        }
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
    // `live` only with a clock: before the first pong `serverNow()` isn't on the server's clock at all, and positions
    // computed from it are off by years. A slow link waits for its first reply instead.
    this.liveOnFirstSample = false;
    this.syncTimers.push(
      window.setTimeout(() => {
        if (this.hasOffset) this.events.onConnection('live');
        else this.liveOnFirstSample = true;
      }, SYNC_PINGS * SYNC_PING_GAP_MS + 200),
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
    if (this.liveOnFirstSample) {
      this.liveOnFirstSample = false;
      this.events.onConnection('live');
    }
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
