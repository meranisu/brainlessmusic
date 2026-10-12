import { randomInt } from 'node:crypto';

/**
 * Room sync ("Listen together", A102): an in-memory registry of shared listening rooms. The server holds the truth
 * (spec: `.docs/specs/room-sync.md`); clients send commands and follow the state they get back. No sockets here: a
 * connection is anything with `send` and `close`, so tests drive the registry with a fake clock and fake sockets.
 */

export const MAX_MEMBERS = 8;
export const MAX_QUEUE = 500;
/** Lead before a new song's start time, so every member can load it before it is due. */
export const SONG_LEAD_MS = 1500;
/** Shorter lead for play and seek within a song that is already loaded. */
export const RESUME_LEAD_MS = 300;
/** A member whose socket dropped is kept, marked away, for this long. */
export const AWAY_GRACE_MS = 2 * 60 * 1000;
/** "Previous" past this point restarts the song instead of going back one. */
export const RESTART_THRESHOLD_MS = 3000;

/** No O/0 or I/1, since codes are read out loud or typed from a chat. */
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const CODE_LENGTH = 6;

export interface RoomTrack {
  trackId: number;
  title: string;
  artist: string | null;
  albumId: number | null;
  durationMs: number;
  /** Levelling gain in dB for each listener's own player; null until measured. */
  gainDb: number | null;
}

export interface QueueEntry extends RoomTrack {
  /** Tells two copies of one song apart. */
  entryId: number;
  addedBy: number;
}

export interface MemberInfo {
  userId: number;
  name: string;
  kind: 'account' | 'guest';
}

export type CloseReason = 'ended' | 'kicked' | 'not-found' | 'replaced' | 'left';

export interface Connection {
  send(message: object): void;
  close(reason: CloseReason): void;
}

interface Member extends MemberInfo {
  connection: Connection | null;
  awayTimer: unknown;
  driftMs: number | null;
  buffering: boolean;
}

interface Playback {
  playing: boolean;
  /** Position at `anchorMs`. While playing, the song is at `positionMs + (now - anchorMs)`. */
  positionMs: number;
  anchorMs: number;
}

interface Room {
  code: string;
  hostUserId: number;
  /** Insertion order is join order, which picks the next host. */
  members: Map<number, Member>;
  queue: QueueEntry[];
  current: number;
  playback: Playback;
  version: number;
  nextEntryId: number;
  songTimer: unknown;
  createdAt: number;
}

export interface RoomSnapshot {
  code: string;
  version: number;
  hostUserId: number;
  members: { userId: number; name: string; kind: 'account' | 'guest'; connected: boolean }[];
  queue: QueueEntry[];
  current: number;
  playback: Playback;
}

export interface RoomOverview extends Omit<RoomSnapshot, 'members'> {
  createdAt: number;
  members: (RoomSnapshot['members'][number] & { driftMs: number | null; buffering: boolean })[];
}

export type Command =
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

export type CommandResult = { ok: true } | { ok: false; reason: string };

export interface RegistryDeps {
  now(): number;
  setTimer(fn: () => void, ms: number): unknown;
  clearTimer(handle: unknown): void;
  /** Playable tracks only: hidden, missing and duration-less ones come back undefined. */
  lookupTracks(ids: number[]): Map<number, RoomTrack>;
}

export function createRoomRegistry(deps: RegistryDeps) {
  const rooms = new Map<string, Room>();
  /** Which room each user is in; one room per user. */
  const roomOfUser = new Map<number, string>();

  function newCode(): string {
    for (;;) {
      let code = '';
      for (let i = 0; i < CODE_LENGTH; i++) code += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
      if (!rooms.has(code)) return code;
    }
  }

  function positionNow(room: Room): number {
    const { playing, positionMs, anchorMs } = room.playback;
    return playing ? Math.max(0, positionMs + (deps.now() - anchorMs)) : positionMs;
  }

  function snapshot(room: Room): RoomSnapshot {
    return {
      code: room.code,
      version: room.version,
      hostUserId: room.hostUserId,
      members: [...room.members.values()].map((m) => ({
        userId: m.userId,
        name: m.name,
        kind: m.kind,
        connected: m.connection !== null,
      })),
      queue: room.queue,
      current: room.current,
      playback: { ...room.playback },
    };
  }

  /** `skip`: a socket that gets this state another way (a newcomer's `welcome`), so it doesn't arrive twice. */
  function broadcast(room: Room, skip?: Connection): void {
    room.version += 1;
    const message = { type: 'state', room: snapshot(room) };
    for (const member of room.members.values()) {
      if (member.connection && member.connection !== skip) member.connection.send(message);
    }
  }

  /** The server ends songs (spec, "The server ends songs"), so five members don't skip five times. */
  function scheduleSongEnd(room: Room): void {
    deps.clearTimer(room.songTimer);
    room.songTimer = null;
    const entry = room.queue[room.current];
    if (!room.playback.playing || !entry) return;

    // From the anchor, not `positionNow`: that clamps at 0, which would drop a new song's load lead.
    const { positionMs, anchorMs } = room.playback;
    const remaining = anchorMs + (entry.durationMs - positionMs) - deps.now();
    room.songTimer = deps.setTimer(() => {
      room.songTimer = null;
      if (room.current + 1 < room.queue.length) {
        startSong(room, room.current + 1, true);
      } else {
        // End of the queue: pause at the end of the last song. Nothing auto-plays.
        room.playback = { playing: false, positionMs: entry.durationMs, anchorMs: deps.now() };
      }
      scheduleSongEnd(room);
      broadcast(room);
    }, Math.max(0, remaining));
  }

  function startSong(room: Room, index: number, playing: boolean): void {
    room.current = index;
    room.playback = { playing, positionMs: 0, anchorMs: deps.now() + (playing ? SONG_LEAD_MS : 0) };
  }

  /** Paused at the end of the last song, the same state a finished queue is left in. */
  function stopAtEnd(room: Room): void {
    room.current = room.queue.length - 1;
    const last = room.queue[room.current];
    room.playback = { playing: false, positionMs: last ? last.durationMs : 0, anchorMs: deps.now() };
  }

  function deleteRoom(room: Room, reason: CloseReason): void {
    deps.clearTimer(room.songTimer);
    for (const member of room.members.values()) {
      deps.clearTimer(member.awayTimer);
      member.connection?.close(reason);
      roomOfUser.delete(member.userId);
    }
    rooms.delete(room.code);
  }

  /** Removes a member; hands the host role to the longest-present member, and deletes a room left empty. */
  function removeMember(room: Room, userId: number, reason: CloseReason): void {
    const member = room.members.get(userId);
    if (!member) return;
    deps.clearTimer(member.awayTimer);
    member.connection?.close(reason);
    room.members.delete(userId);
    if (roomOfUser.get(userId) === room.code) roomOfUser.delete(userId);

    if (room.members.size === 0) {
      deleteRoom(room, 'ended');
      return;
    }
    if (room.hostUserId === userId) room.hostUserId = room.members.keys().next().value!;
    broadcast(room);
  }

  function startAwayTimer(room: Room, member: Member): void {
    deps.clearTimer(member.awayTimer);
    member.awayTimer = deps.setTimer(() => {
      member.awayTimer = null;
      removeMember(room, member.userId, 'left');
    }, AWAY_GRACE_MS);
  }

  /** Takes a user out of whatever room they are in, so joining or making another one moves them. */
  function leaveCurrentRoom(userId: number): void {
    const code = roomOfUser.get(userId);
    const room = code ? rooms.get(code) : undefined;
    if (room) removeMember(room, userId, 'replaced');
  }

  function toEntries(room: Room, trackIds: number[], addedBy: number): QueueEntry[] | string {
    const found = deps.lookupTracks(trackIds);
    const entries: QueueEntry[] = [];
    for (const id of trackIds) {
      const track = found.get(id);
      if (!track) return `track ${id} can't be played`;
      entries.push({ ...track, entryId: room.nextEntryId++, addedBy });
    }
    return entries;
  }

  function indexOfEntry(room: Room, entryId: unknown): number {
    return room.queue.findIndex((e) => e.entryId === entryId);
  }

  function isCurrent(room: Room, entryId: unknown): boolean {
    return room.current >= 0 && room.queue[room.current]?.entryId === entryId;
  }

  function apply(room: Room, userId: number, cmd: Command): CommandResult {
    const now = deps.now();
    const current = room.queue[room.current];

    switch (cmd.op) {
      case 'play': {
        if (room.playback.playing) return { ok: false, reason: 'already-playing' };
        if (!current) return { ok: false, reason: 'empty' };
        const at = room.playback.positionMs >= current.durationMs ? 0 : room.playback.positionMs;
        room.playback = { playing: true, positionMs: at, anchorMs: now + RESUME_LEAD_MS };
        return { ok: true };
      }
      case 'pause': {
        if (!room.playback.playing) return { ok: false, reason: 'already-paused' };
        room.playback = { playing: false, positionMs: positionNow(room), anchorMs: now };
        return { ok: true };
      }
      case 'seek': {
        if (!isCurrent(room, cmd.entryId)) return { ok: false, reason: 'stale' };
        if (typeof cmd.positionMs !== 'number' || !Number.isFinite(cmd.positionMs)) {
          return { ok: false, reason: 'invalid' };
        }
        const at = Math.min(Math.max(0, cmd.positionMs), current!.durationMs);
        const playing = room.playback.playing;
        room.playback = { playing, positionMs: at, anchorMs: playing ? now + RESUME_LEAD_MS : now };
        return { ok: true };
      }
      case 'next': {
        // Names the song the sender saw, so two skips pressed at once count as one.
        if (!isCurrent(room, cmd.entryId)) return { ok: false, reason: 'stale' };
        if (room.current + 1 >= room.queue.length) return { ok: false, reason: 'end-of-queue' };
        startSong(room, room.current + 1, room.playback.playing);
        return { ok: true };
      }
      case 'previous': {
        if (!isCurrent(room, cmd.entryId)) return { ok: false, reason: 'stale' };
        const target = positionNow(room) > RESTART_THRESHOLD_MS || room.current === 0 ? room.current : room.current - 1;
        startSong(room, target, room.playback.playing);
        return { ok: true };
      }
      case 'jump': {
        const index = indexOfEntry(room, cmd.entryId);
        if (index < 0) return { ok: false, reason: 'gone' };
        startSong(room, index, true);
        return { ok: true };
      }
      case 'add': {
        if (!Array.isArray(cmd.trackIds) || cmd.trackIds.length === 0) return { ok: false, reason: 'invalid' };
        if (!cmd.trackIds.every((id) => Number.isInteger(id) && id > 0)) return { ok: false, reason: 'invalid' };
        if (room.queue.length + cmd.trackIds.length > MAX_QUEUE) return { ok: false, reason: 'queue-full' };
        let at = room.queue.length;
        if (cmd.after !== undefined) {
          const afterIndex = indexOfEntry(room, cmd.after);
          if (afterIndex < 0) return { ok: false, reason: 'gone' };
          at = afterIndex + 1;
        }
        const entries = toEntries(room, cmd.trackIds, userId);
        if (typeof entries === 'string') return { ok: false, reason: 'unplayable' };
        room.queue.splice(at, 0, ...entries);
        if (room.current < 0) startSong(room, 0, false);
        else if (at <= room.current) room.current += entries.length;
        return { ok: true };
      }
      case 'remove': {
        const index = indexOfEntry(room, cmd.entryId);
        if (index < 0) return { ok: false, reason: 'gone' };
        room.queue.splice(index, 1);
        if (index < room.current) {
          room.current -= 1;
        } else if (index === room.current) {
          // The song after it slides into place and starts; with none after, the room stops at the end.
          if (room.queue.length === 0) {
            room.current = -1;
            room.playback = { playing: false, positionMs: 0, anchorMs: now };
          } else if (index < room.queue.length) {
            startSong(room, index, room.playback.playing);
          } else {
            stopAtEnd(room);
          }
        }
        return { ok: true };
      }
      case 'move': {
        const index = indexOfEntry(room, cmd.entryId);
        if (index < 0) return { ok: false, reason: 'gone' };
        if (!Number.isInteger(cmd.toIndex) || cmd.toIndex < 0 || cmd.toIndex >= room.queue.length) {
          return { ok: false, reason: 'invalid' };
        }
        const playingEntry = room.queue[room.current];
        const [moved] = room.queue.splice(index, 1);
        room.queue.splice(cmd.toIndex, 0, moved);
        if (playingEntry) room.current = room.queue.indexOf(playingEntry);
        return { ok: true };
      }
      case 'end': {
        if (room.hostUserId !== userId) return { ok: false, reason: 'host-only' };
        deleteRoom(room, 'ended');
        return { ok: true };
      }
      case 'kick': {
        if (room.hostUserId !== userId) return { ok: false, reason: 'host-only' };
        if (cmd.userId === userId || !room.members.has(cmd.userId)) return { ok: false, reason: 'invalid' };
        removeMember(room, cmd.userId, 'kicked');
        return { ok: true };
      }
      default:
        return { ok: false, reason: 'unknown-op' };
    }
  }

  return {
    now: deps.now,

    /**
     * Makes a room from the creator's current queue and position (spec, Scope 1). The creator starts as an away
     * member until their socket connects, so a room nobody opens disappears after the grace period.
     */
    create(creator: MemberInfo, start: { trackIds: number[]; current: number; positionMs: number; playing: boolean }):
      | { ok: true; code: string }
      | { ok: false; reason: string } {
      if (start.trackIds.length > MAX_QUEUE) return { ok: false, reason: 'queue-full' };

      const room: Room = {
        code: newCode(),
        hostUserId: creator.userId,
        members: new Map(),
        queue: [],
        current: -1,
        playback: { playing: false, positionMs: 0, anchorMs: deps.now() },
        version: 0,
        nextEntryId: 1,
        songTimer: null,
        createdAt: deps.now(),
      };
      const entries = toEntries(room, start.trackIds, creator.userId);
      if (typeof entries === 'string') return { ok: false, reason: entries };
      // Only once the new room is known to be valid, so a bad request doesn't cost the user their current room.
      leaveCurrentRoom(creator.userId);
      room.queue = entries;
      if (entries.length > 0) {
        const index = Math.min(Math.max(0, start.current), entries.length - 1);
        const at = Math.min(Math.max(0, start.positionMs), entries[index].durationMs);
        room.current = index;
        room.playback = { playing: start.playing, positionMs: at, anchorMs: deps.now() + (start.playing ? SONG_LEAD_MS : 0) };
      }

      const member: Member = { ...creator, connection: null, awayTimer: null, driftMs: null, buffering: false };
      room.members.set(creator.userId, member);
      rooms.set(room.code, room);
      roomOfUser.set(creator.userId, room.code);
      startAwayTimer(room, member);
      scheduleSongEnd(room);
      return { ok: true, code: room.code };
    },

    /**
     * Attaches a socket. Joining from a second device, or joining a different room, takes over: the old socket gets
     * `closed {replaced}`.
     */
    connect(code: string, info: MemberInfo, connection: Connection):
      | { ok: true; room: RoomSnapshot }
      | { ok: false; reason: 'not-found' | 'full' } {
      const room = rooms.get(code.toUpperCase());
      if (!room) return { ok: false, reason: 'not-found' };

      let member = room.members.get(info.userId);
      if (!member && room.members.size >= MAX_MEMBERS) return { ok: false, reason: 'full' };

      if (member) {
        member.connection?.close('replaced');
      } else {
        leaveCurrentRoom(info.userId);
        member = { ...info, connection: null, awayTimer: null, driftMs: null, buffering: false };
        room.members.set(info.userId, member);
        roomOfUser.set(info.userId, room.code);
      }
      deps.clearTimer(member.awayTimer);
      member.awayTimer = null;
      member.connection = connection;
      member.name = info.name;
      broadcast(room, connection);
      return { ok: true, room: snapshot(room) };
    },

    /** A dropped socket: the member is marked away and removed after the grace period, unless they come back. */
    disconnect(code: string, userId: number, connection: Connection): void {
      const room = rooms.get(code);
      const member = room?.members.get(userId);
      // An old socket closing after its replacement connected must not mark the new one away.
      if (!room || !member || member.connection !== connection) return;
      member.connection = null;
      member.driftMs = null;
      startAwayTimer(room, member);
      broadcast(room);
    },

    leave(code: string, userId: number): void {
      const room = rooms.get(code);
      if (room) removeMember(room, userId, 'left');
    },

    command(code: string, userId: number, cmd: Command): CommandResult {
      const room = rooms.get(code);
      if (!room || !room.members.has(userId)) return { ok: false, reason: 'not-found' };
      const result = apply(room, userId, cmd);
      // `end` deletes the room and `kick` already broadcast from `removeMember`: one state per change, not two.
      if (result.ok && rooms.has(room.code) && cmd.op !== 'kick') {
        scheduleSongEnd(room);
        broadcast(room);
      }
      return result;
    },

    status(code: string, userId: number, driftMs: number | null, buffering: boolean): void {
      const member = rooms.get(code)?.members.get(userId);
      if (!member) return;
      member.driftMs = driftMs;
      member.buffering = buffering;
    },

    snapshot(code: string): RoomSnapshot | undefined {
      const room = rooms.get(code.toUpperCase());
      return room ? snapshot(room) : undefined;
    },

    codeOfUser(userId: number): string | undefined {
      return roomOfUser.get(userId);
    },

    /** For the Control Center monitor. */
    overview(): RoomOverview[] {
      return [...rooms.values()].map((room) => ({
        ...snapshot(room),
        createdAt: room.createdAt,
        members: [...room.members.values()].map((m) => ({
          userId: m.userId,
          name: m.name,
          kind: m.kind,
          connected: m.connection !== null,
          driftMs: m.driftMs,
          buffering: m.buffering,
        })),
      }));
    },

    /** Tests only. */
    reset(): void {
      for (const room of [...rooms.values()]) deleteRoom(room, 'ended');
    },
  };
}

export type RoomRegistry = ReturnType<typeof createRoomRegistry>;
