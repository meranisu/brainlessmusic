import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { useAuth } from '../auth/AuthContext';
import { apiClient } from '../lib/apiClient';
import {
  RoomClient,
  type ClosedReason,
  type Connection,
  type RoomCommand,
  type RoomState,
} from '../lib/roomClient';
import { useToast } from './ToastProvider';

/**
 * "Listen together" (A102): which room this tab is in, live. Sits outside `PlayerProvider`, which follows the room's
 * state while one is joined. Spec: `.docs/specs/room-sync.md`.
 */

export interface RoomStart {
  trackIds: number[];
  current: number;
  positionMs: number;
  playing: boolean;
}

export interface RoomContextValue {
  /** The joined room, or null. Kept through a reconnect, so the music and the room view carry on. */
  room: RoomState | null;
  /** Our user id in the room. */
  you: number | null;
  connection: Connection;
  /** True while waiting for the first state after making or joining a room. */
  isJoining: boolean;
  create: (start: RoomStart) => Promise<void>;
  join: (code: string) => void;
  leave: () => void;
  send: (command: RoomCommand) => void;
  /** Server clock now, in ms; meaningful only while `connection` is `live`. */
  serverNow: () => number;
  reportStatus: (driftMs: number | null, buffering: boolean) => void;
}

const RoomContext = createContext<RoomContextValue | undefined>(undefined);

const CLOSED_MESSAGES: Record<ClosedReason, string> = {
  ended: 'The room was ended.',
  kicked: 'The host took you out of the room.',
  'not-found': 'That room is gone. The music carries on here.',
  replaced: 'You joined from somewhere else, so this tab left the room.',
  left: 'You left the room.',
  full: 'That room is full (8 people).',
  unauthorized: 'Your sign-in ran out, so you left the room.',
};

/** Rejections worth telling someone about. `stale` (two people pressed skip at once) is normal and stays quiet. */
const REJECTION_MESSAGES: Record<string, string> = {
  unplayable: "That song can't be played in a room.",
  'queue-full': 'The room queue is full (500 songs).',
  'host-only': 'Only the host can do that.',
  'end-of-queue': "That's the last song in the queue.",
  'not-allowed': 'The host has kept that for themselves in this room.',
  'turns-on': "Take turns sets the order, so songs can't be moved while it's on.",
  'bad-settings': "That setting didn't save. Try again.",
};

/** A new vote to skip, said once as a toast to everyone in the room: "bob voted to skip (1 of 2)" (A254). */
function voteMessage(before: RoomState | null, after: RoomState, you: number | null): string | null {
  const vote = after.skipVote;
  if (!vote || !before) return null;
  const earlier = before.skipVote?.entryId === vote.entryId ? before.skipVote.votes : [];
  const voter = vote.votes.find((id) => !earlier.includes(id));
  if (voter === undefined) return null;
  const name = voter === you ? 'You' : (after.members.find((m) => m.userId === voter)?.name ?? 'Someone');
  return `${name} voted to skip (${vote.votes.length} of ${vote.needed}).`;
}

export function RoomProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const { showToast } = useToast();
  const [room, setRoom] = useState<RoomState | null>(null);
  // Whose room it is: after a sign-out and a sign-in as someone else, the old state must not show.
  const [roomFor, setRoomFor] = useState<number | null>(null);
  const userIdRef = useRef<number | null>(null);
  useEffect(() => {
    userIdRef.current = user?.id ?? null;
  }, [user]);
  const [you, setYou] = useState<number | null>(null);
  const [connection, setConnection] = useState<Connection>('connecting');
  const [isJoining, setIsJoining] = useState(false);
  const clientRef = useRef<RoomClient | null>(null);
  const lastStateRef = useRef<RoomState | null>(null);

  // Cleared, not just hidden: signing back in as the same account would otherwise show the old room until a new
  // state arrives. Set during render, so there is no frame with the old room.
  if (!user && (room || you !== null || roomFor !== null || isJoining || connection !== 'connecting')) {
    setRoom(null);
    setRoomFor(null);
    setYou(null);
    setIsJoining(false);
    setConnection('connecting');
  }

  const connect = useCallback(
    (code: string, quietIfGone = false) => {
      clientRef.current?.stop();
      setIsJoining(true);
      const client = new RoomClient(code.trim().toUpperCase(), {
        onState(next, yourId) {
          if (clientRef.current !== client) return;
          const voted = voteMessage(lastStateRef.current, next, yourId ?? userIdRef.current);
          if (voted) showToast(voted);
          lastStateRef.current = next;
          setRoom(next);
          setRoomFor(userIdRef.current);
          if (yourId !== undefined) setYou(yourId);
          setIsJoining(false);
        },
        onConnection(next) {
          if (clientRef.current === client) setConnection(next);
        },
        onClosed(reason) {
          if (clientRef.current !== client) return;
          clientRef.current = null;
          lastStateRef.current = null;
          setRoom(null);
          setYou(null);
          setIsJoining(false);
          if (reason === 'left') return;
          if (reason === 'not-found' && quietIfGone) return;
          showToast(CLOSED_MESSAGES[reason] ?? 'You left the room.', reason === 'not-found' ? 'error' : 'success');
        },
        onRejected(_op, reason) {
          const message = REJECTION_MESSAGES[reason];
          if (message) showToast(message, 'error');
        },
      });
      clientRef.current = client;
      client.connect();
    },
    [showToast],
  );

  // After a reload, back into the room this account was in. Signing out stops the socket (the server keeps us as
  // away for its grace period, then drops us).
  useEffect(() => {
    if (!user) {
      // The room state is cleared below, during render, once the user is null.
      clientRef.current?.stop();
      clientRef.current = null;
      return;
    }
    let cancelled = false;
    void apiClient
      .get<{ code: string | null }>('/rooms/mine')
      .then(({ code }) => {
        if (!cancelled && code && !clientRef.current) connect(code, true);
      })
      .catch(() => {
        // No rejoin is the same as not having been in a room.
      });
    return () => {
      cancelled = true;
    };
  }, [user, connect]);

  useEffect(() => () => clientRef.current?.stop(), []);

  const create = useCallback(
    async (start: RoomStart) => {
      const { code } = await apiClient.post<{ code: string }>('/rooms', start);
      connect(code);
    },
    [connect],
  );

  const join = useCallback((code: string) => connect(code), [connect]);

  const leave = useCallback(() => {
    const client = clientRef.current;
    clientRef.current = null;
    client?.leave();
    setRoom(null);
    setYou(null);
    setIsJoining(false);
  }, []);

  const send = useCallback((command: RoomCommand) => clientRef.current?.send(command), []);
  const serverNow = useCallback(() => clientRef.current?.serverNow() ?? Date.now(), []);
  const reportStatus = useCallback(
    (driftMs: number | null, buffering: boolean) => clientRef.current?.status(driftMs, buffering),
    [],
  );

  const isTheirs = user != null && roomFor === user.id;

  return (
    <RoomContext.Provider
      value={{
        room: isTheirs ? room : null,
        you: isTheirs ? you : null,
        connection,
        isJoining: Boolean(user) && isJoining,
        create,
        join,
        leave,
        send,
        serverNow,
        reportStatus,
      }}
    >
      {children}
    </RoomContext.Provider>
  );
}

export function useRoom(): RoomContextValue {
  const value = useContext(RoomContext);
  if (!value) throw new Error('useRoom must be used inside RoomProvider');
  return value;
}
