import { randomCode } from '../utils/randomCode.js';

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
/** An invite to a room nobody answers lapses after this (A255). */
export const INVITE_TTL_MS = 10 * 60 * 1000;
/** People one invite call may name: as many as a room can hold. */
export const MAX_INVITES_PER_CALL = MAX_MEMBERS;

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
  /** Kept on the entry, so the queue still shows whose song it is after they leave (A256). */
  addedByName: string;
  addedByAvatarId: string | null;
}

/**
 * What the host decides for the room (A253). The host is never held back by these; `'host'` means only the host.
 * `editQueue` is moving or removing other people's songs: your own you can always move or remove.
 */
export interface RoomSettings {
  shuffle: boolean;
  repeat: 'off' | 'all' | 'one';
  /** Upcoming songs take turns by who added them, one each in rotation. */
  turns: boolean;
  /** `vote`: the song's adder skips at once, anyone else votes (A254). */
  skip: 'vote' | 'everyone' | 'host';
  playback: 'everyone' | 'host';
  add: 'everyone' | 'host';
  editQueue: 'everyone' | 'host';
  invite: 'everyone' | 'host';
}

export const DEFAULT_SETTINGS: RoomSettings = {
  shuffle: false,
  repeat: 'off',
  turns: false,
  skip: 'vote',
  playback: 'everyone',
  add: 'everyone',
  editQueue: 'everyone',
  invite: 'everyone',
};

/** The values each setting accepts, which is also how a `settings` command is checked. */
const SETTING_VALUES: { [K in keyof RoomSettings]: readonly RoomSettings[K][] } = {
  shuffle: [true, false],
  repeat: ['off', 'all', 'one'],
  turns: [true, false],
  skip: ['vote', 'everyone', 'host'],
  playback: ['everyone', 'host'],
  add: ['everyone', 'host'],
  editQueue: ['everyone', 'host'],
  invite: ['everyone', 'host'],
};

/** Votes needed to skip: more than half of the people connected, but one when there are only two (A254). */
export function votesNeeded(connected: number): number {
  return connected <= 2 ? 1 : Math.floor(connected / 2) + 1;
}

export interface MemberInfo {
  userId: number;
  name: string;
  kind: 'account' | 'guest';
  /** Their profile picture, so the members list can show it; null without one (guests never have one). */
  avatarId?: string | null;
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
  settings: RoomSettings;
  /** Votes to skip the song with this entry id; cleared when the song changes. */
  skipVote: { entryId: number; voters: Set<number> } | null;
}

export interface RoomSnapshot {
  code: string;
  version: number;
  hostUserId: number;
  members: { userId: number; name: string; kind: 'account' | 'guest'; avatarId: string | null; connected: boolean }[];
  queue: QueueEntry[];
  current: number;
  playback: Playback;
  settings: RoomSettings;
  skipVote: { entryId: number; votes: number[]; needed: number } | null;
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
  | { op: 'kick'; userId: number }
  | { op: 'settings'; settings: Partial<RoomSettings> };

export type CommandResult = { ok: true } | { ok: false; reason: string };

export interface RoomInvite {
  code: string;
  fromUserId: number;
  expiresAt: number;
}

export interface RegistryDeps {
  now(): number;
  setTimer(fn: () => void, ms: number): unknown;
  clearTimer(handle: unknown): void;
  /** Playable tracks only: hidden, missing and duration-less ones come back undefined. */
  lookupTracks(ids: number[]): Map<number, RoomTrack>;
  /** Shuffle's dice, in [0, 1); `Math.random` unless a test needs a fixed order. */
  random?(): number;
}

export function createRoomRegistry(deps: RegistryDeps) {
  const rooms = new Map<string, Room>();
  /** Which room each user is in; one room per user. */
  const roomOfUser = new Map<number, string>();
  const random = deps.random ?? Math.random;
  /** Room invites waiting for an answer, by the invited user and then room code (A255). In memory, like rooms. */
  const invites = new Map<number, Map<string, RoomInvite>>();

  function dropInvitesTo(code: string): void {
    for (const [userId, mine] of invites) {
      mine.delete(code);
      if (mine.size === 0) invites.delete(userId);
    }
  }

  function newCode(): string {
    for (;;) {
      const code = randomCode(CODE_ALPHABET, CODE_LENGTH);
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
        avatarId: m.avatarId ?? null,
        connected: m.connection !== null,
      })),
      queue: room.queue,
      current: room.current,
      playback: { ...room.playback },
      settings: { ...room.settings },
      skipVote: room.skipVote
        ? {
            entryId: room.skipVote.entryId,
            votes: [...room.skipVote.voters].filter((id) => room.members.get(id)?.connection),
            needed: votesNeeded(connectedCount(room)),
          }
        : null,
    };
  }

  function connectedCount(room: Room): number {
    let count = 0;
    for (const member of room.members.values()) if (member.connection) count += 1;
    return count;
  }

  /** The host does anything; everyone else what the room's settings allow. */
  function allowed(room: Room, userId: number, area: 'playback' | 'add' | 'editQueue' | 'invite'): boolean {
    return room.hostUserId === userId || room.settings[area] === 'everyone';
  }

  /**
   * To the next song, or round to the first with repeat all. False at the end of the queue, which is left alone.
   */
  function advance(room: Room, playing: boolean): boolean {
    if (room.current + 1 < room.queue.length) startSong(room, room.current + 1, playing);
    else if (room.settings.repeat === 'all' && room.queue.length > 0) startSong(room, 0, playing);
    else return false;
    return true;
  }

  /** Skips once enough of the people connected have voted. Run after a vote and whenever someone drops. */
  function settleSkipVote(room: Room): boolean {
    const vote = room.skipVote;
    if (!vote) return false;
    if (!isCurrent(room, vote.entryId)) {
      room.skipVote = null;
      return false;
    }
    const votes = [...vote.voters].filter((id) => room.members.get(id)?.connection).length;
    if (votes < votesNeeded(connectedCount(room))) return false;
    room.skipVote = null;
    if (!advance(room, room.playback.playing)) return false;
    scheduleSongEnd(room);
    return true;
  }

  /** In place, so callers can shuffle a slice of the queue by passing a copy and writing it back. */
  function shuffleInPlace<T>(items: T[]): void {
    for (let i = items.length - 1; i > 0; i -= 1) {
      const j = Math.floor(random() * (i + 1));
      [items[i], items[j]] = [items[j], items[i]];
    }
  }

  /** Sets the songs after the current one back in their place, keeping the current song where it is. */
  function setUpcoming(room: Room, upcoming: QueueEntry[]): void {
    room.queue.splice(room.current + 1, upcoming.length, ...upcoming);
  }

  /**
   * Take turns: the songs after the current one go one per person in rotation, each person's own songs in the order
   * they are already in. The rotation follows join order and starts after the person whose song is playing.
   */
  function arrangeTurns(room: Room): void {
    const upcoming = room.queue.slice(room.current + 1);
    const byPerson = new Map<number, QueueEntry[]>();
    for (const entry of upcoming) {
      const list = byPerson.get(entry.addedBy);
      if (list) list.push(entry);
      else byPerson.set(entry.addedBy, [entry]);
    }
    // Members in join order, then anyone who has left but still has songs waiting.
    const people = [...room.members.keys(), ...byPerson.keys()].filter((id, i, all) => all.indexOf(id) === i);
    const playingAdder = room.queue[room.current]?.addedBy;
    const start = playingAdder === undefined ? 0 : people.indexOf(playingAdder) + 1;
    const order = [...people.slice(start), ...people.slice(0, start)].filter((id) => byPerson.has(id));

    const arranged: QueueEntry[] = [];
    while (arranged.length < upcoming.length) {
      for (const id of order) {
        const next = byPerson.get(id)!.shift();
        if (next) arranged.push(next);
      }
    }
    setUpcoming(room, arranged);
  }

  function applySettings(room: Room, change: unknown): CommandResult {
    if (!change || typeof change !== 'object' || Array.isArray(change)) return { ok: false, reason: 'bad-settings' };
    const entries = Object.entries(change);
    if (entries.length === 0) return { ok: false, reason: 'bad-settings' };
    for (const [key, value] of entries) {
      const values = SETTING_VALUES[key as keyof RoomSettings] as readonly unknown[] | undefined;
      if (!values || !values.includes(value)) return { ok: false, reason: 'bad-settings' };
    }
    const before = room.settings;
    room.settings = { ...before, ...(change as Partial<RoomSettings>) };
    // Shuffling once when it's turned on (Q259: turning it off keeps that order).
    if (room.settings.shuffle && !before.shuffle) {
      const upcoming = room.queue.slice(room.current + 1);
      shuffleInPlace(upcoming);
      setUpcoming(room, upcoming);
    }
    if (room.settings.turns && (!before.turns || (room.settings.shuffle && !before.shuffle))) arrangeTurns(room);
    // A vote taken under the old rule doesn't carry over to a new one.
    if (room.settings.skip !== 'vote') room.skipVote = null;
    return { ok: true };
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
      if (room.settings.repeat === 'one') {
        startSong(room, room.current, true);
      } else if (!advance(room, true)) {
        // End of the queue: pause at the end of the last song. Nothing auto-plays, unless repeat all went round.
        room.playback = { playing: false, positionMs: entry.durationMs, anchorMs: deps.now() };
      }
      scheduleSongEnd(room);
      broadcast(room);
    }, Math.max(0, remaining));
  }

  function startSong(room: Room, index: number, playing: boolean): void {
    room.current = index;
    room.playback = { playing, positionMs: 0, anchorMs: deps.now() + (playing ? SONG_LEAD_MS : 0) };
    room.skipVote = null;
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
    dropInvitesTo(room.code);
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
    settleSkipVote(room);
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

  function toEntries(room: Room, trackIds: number[], adder: MemberInfo): QueueEntry[] | string {
    const found = deps.lookupTracks(trackIds);
    const entries: QueueEntry[] = [];
    for (const id of trackIds) {
      const track = found.get(id);
      if (!track) return `track ${id} can't be played`;
      entries.push({
        ...track,
        entryId: room.nextEntryId++,
        addedBy: adder.userId,
        addedByName: adder.name,
        addedByAvatarId: adder.avatarId ?? null,
      });
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
    const isHost = room.hostUserId === userId;
    const playbackOps = ['play', 'pause', 'seek', 'previous', 'jump'];
    if (playbackOps.includes(cmd.op) && !allowed(room, userId, 'playback')) return { ok: false, reason: 'not-allowed' };

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
        const atEnd = room.current + 1 >= room.queue.length && room.settings.repeat !== 'all';
        if (atEnd) return { ok: false, reason: 'end-of-queue' };
        const { skip } = room.settings;
        // Q257: the host skips at once too.
        if (isHost || skip === 'everyone' || current!.addedBy === userId) {
          advance(room, room.playback.playing);
          return { ok: true };
        }
        if (skip === 'host') return { ok: false, reason: 'not-allowed' };
        if (room.skipVote?.entryId !== current!.entryId) room.skipVote = { entryId: current!.entryId, voters: new Set() };
        room.skipVote.voters.add(userId);
        settleSkipVote(room);
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
        if (!allowed(room, userId, 'add')) return { ok: false, reason: 'not-allowed' };
        if (room.queue.length + cmd.trackIds.length > MAX_QUEUE) return { ok: false, reason: 'queue-full' };
        let at = room.queue.length;
        if (cmd.after !== undefined) {
          const afterIndex = indexOfEntry(room, cmd.after);
          if (afterIndex < 0) return { ok: false, reason: 'gone' };
          at = afterIndex + 1;
        }
        const entries = toEntries(room, cmd.trackIds, room.members.get(userId)!);
        if (typeof entries === 'string') return { ok: false, reason: 'unplayable' };
        if (room.settings.shuffle && cmd.after === undefined && room.current >= 0) {
          // Each new song lands at a random spot among the songs still to come.
          for (const entry of entries) {
            const spot = room.current + 1 + Math.floor(random() * (room.queue.length - room.current));
            room.queue.splice(spot, 0, entry);
          }
        } else {
          room.queue.splice(at, 0, ...entries);
          if (room.current >= 0 && at <= room.current) room.current += entries.length;
        }
        if (room.current < 0) startSong(room, 0, false);
        // Turns decides the order of what's to come, a "play next" included.
        if (room.settings.turns) arrangeTurns(room);
        return { ok: true };
      }
      case 'remove': {
        const index = indexOfEntry(room, cmd.entryId);
        if (index < 0) return { ok: false, reason: 'gone' };
        if (room.queue[index].addedBy !== userId && !allowed(room, userId, 'editQueue')) {
          return { ok: false, reason: 'not-allowed' };
        }
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
        if (room.settings.turns) arrangeTurns(room);
        return { ok: true };
      }
      case 'move': {
        const index = indexOfEntry(room, cmd.entryId);
        if (index < 0) return { ok: false, reason: 'gone' };
        if (room.queue[index].addedBy !== userId && !allowed(room, userId, 'editQueue')) {
          return { ok: false, reason: 'not-allowed' };
        }
        if (room.settings.turns) return { ok: false, reason: 'turns-on' };
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
      case 'settings': {
        if (!isHost) return { ok: false, reason: 'host-only' };
        return applySettings(room, cmd.settings);
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
        settings: { ...DEFAULT_SETTINGS },
        skipVote: null,
      };
      const entries = toEntries(room, start.trackIds, creator);
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
        invites.get(info.userId)?.delete(room.code);
      }
      deps.clearTimer(member.awayTimer);
      member.awayTimer = null;
      member.connection = connection;
      member.name = info.name;
      member.avatarId = info.avatarId ?? null;
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
      // One fewer person connected can be enough for the votes already in.
      settleSkipVote(room);
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

    /** The song a room is playing and how far in, for friends' now playing; undefined while paused or empty. */
    playingIn(code: string): { trackId: number; positionMs: number } | undefined {
      const room = rooms.get(code);
      const entry = room?.queue[room.current];
      if (!room || !entry || !room.playback.playing) return undefined;
      return { trackId: entry.trackId, positionMs: Math.min(positionNow(room), entry.durationMs) };
    },

    /**
     * Invites people to the sender's room. Who may be invited (accounts only) is the caller's check; here: the
     * sender is in a room the settings let them invite from, and nobody already in it or already invited is asked
     * twice. Returns how many new invites went out.
     */
    invite(fromUserId: number, toUserIds: number[]): { ok: true; invited: number } | { ok: false; reason: string } {
      const code = roomOfUser.get(fromUserId);
      const room = code ? rooms.get(code) : undefined;
      if (!room) return { ok: false, reason: 'not-in-room' };
      if (!allowed(room, fromUserId, 'invite')) return { ok: false, reason: 'not-allowed' };
      let invited = 0;
      const expiresAt = deps.now() + INVITE_TTL_MS;
      for (const userId of new Set(toUserIds)) {
        if (room.members.has(userId)) continue;
        const mine = invites.get(userId) ?? new Map<string, RoomInvite>();
        const pending = mine.get(room.code);
        if (pending && pending.expiresAt > deps.now()) continue;
        mine.set(room.code, { code: room.code, fromUserId, expiresAt });
        invites.set(userId, mine);
        invited += 1;
      }
      return { ok: true, invited };
    },

    /** A user's open invites, newest first, with lapsed ones and ones to rooms they're already in left out. */
    invitesFor(userId: number): RoomInvite[] {
      const mine = invites.get(userId);
      if (!mine) return [];
      for (const [code, invite] of mine) {
        if (invite.expiresAt <= deps.now() || !rooms.has(code)) mine.delete(code);
      }
      return [...mine.values()]
        .filter((invite) => roomOfUser.get(userId) !== invite.code)
        .sort((a, b) => b.expiresAt - a.expiresAt);
    },

    declineInvite(userId: number, code: string): void {
      invites.get(userId)?.delete(code.toUpperCase());
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
          avatarId: m.avatarId ?? null,
          connected: m.connection !== null,
          driftMs: m.driftMs,
          buffering: m.buffering,
        })),
      }));
    },

    /** Tests only. */
    reset(): void {
      for (const room of [...rooms.values()]) deleteRoom(room, 'ended');
      invites.clear();
    },
  };
}

export type RoomRegistry = ReturnType<typeof createRoomRegistry>;
