import { useMutation, useQuery } from '@tanstack/react-query';
import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { usePlayer } from '../components/PlayerBar';
import { useRoom } from '../components/RoomProvider';
import { useToast } from '../components/ToastProvider';
import { ArrowUpIcon, CloseIcon, GearIcon, PlayIcon } from '../components/icons';
import { MarqueeText } from '../components/MarqueeText';
import { useDialogA11y } from '../hooks/useDialogA11y';
import { useScrollLock } from '../hooks/useScrollLock';
import { ApiError, apiClient, reportRoomIssue } from '../lib/apiClient';
import { copyText } from '../lib/copyText';
import { roomAllows, type RoomSettings, type RoomState } from '../lib/roomClient';
import type { SocialPerson } from '../types/api';
import { AddedBy } from '../components/AddedBy';
import { ROOM_CODE_CHARS, ROOM_CODE_LENGTH, clearRoomLink, pendingRoomLink, roomLinkFor } from '../lib/roomLink';
import { Avatar } from '../components/Avatar';

/**
 * "Listen together" (A102): start or join a room, then see who's in it and the shared queue. Everyone controls what
 * the host's room settings allow (A253, narrowing A101); only the host ends the room or removes people. Guests join
 * with the same controls as anyone else (A100).
 */

const CODE_LENGTH = ROOM_CODE_LENGTH;
const CODE_CHARS = ROOM_CODE_CHARS;

interface RoomPreview {
  code: string;
  members: string[];
  nowPlaying: { title: string; artist: string | null } | null;
}

/** The code as six tiles, like an arcade's name entry: it's what people read out to each other. */
function CodeTiles({ code }: { code: string }) {
  return (
    <div className="flex gap-1.5 sm:gap-2" aria-label={`Room code ${code.split('').join(' ')}`}>
      {code.split('').map((letter, i) => (
        <span
          key={i}
          aria-hidden
          className="font-display flex h-14 w-11 items-center justify-center rounded-md border-2 border-blue-600 bg-blue-950 text-4xl font-extrabold text-white sm:h-16 sm:w-12 sm:text-5xl"
        >
          {letter}
        </span>
      ))}
    </div>
  );
}

function OutsideRoom({ linked }: { linked: string | null }) {
  const { create, join, isJoining } = useRoom();
  const player = usePlayer();
  const { showToast } = useToast();
  // A room link's code, filled in and looked up, so Join shows who's in before the click that changes the music.
  const [code, setCode] = useState(linked ?? '');
  // The answer for one code; anything typed since makes it stale, so `lookup` is derived from it.
  const [result, setResult] = useState<{ code: string; preview: RoomPreview | null; failed: 'missing' | 'failed' | null }>();
  const [isStarting, setIsStarting] = useState(false);

  // Look the room up once the whole code is typed, so a wrong code shows before joining.
  useEffect(() => {
    if (code.length !== CODE_LENGTH) return;
    let cancelled = false;
    apiClient
      .get<RoomPreview>(`/rooms/${code}`)
      .then((found) => {
        if (!cancelled) setResult({ code, preview: found, failed: null });
      })
      .catch((err) => {
        if (cancelled) return;
        const missing = err instanceof ApiError && err.status === 404;
        if (!missing) reportRoomIssue('request-failed', "Couldn't look up a room", { error: err, roomCode: code });
        setResult({ code, preview: null, failed: missing ? 'missing' : 'failed' });
      });
    return () => {
      cancelled = true;
    };
  }, [code]);

  const current = result?.code === code ? result : undefined;
  const preview = current?.preview ?? null;
  const lookup = code.length !== CODE_LENGTH ? 'idle' : current ? (current.failed ?? 'idle') : 'looking';

  async function start() {
    setIsStarting(true);
    try {
      await create({
        trackIds: player.queue.map((t) => t.id),
        current: player.index,
        positionMs: Math.round(player.currentTime * 1000),
        playing: player.isPlaying,
      });
    } catch (err) {
      showToast(err instanceof Error ? `Couldn't start a room: ${err.message}` : "Couldn't start a room.", 'error');
    } finally {
      setIsStarting(false);
    }
  }

  function onJoin(event: FormEvent) {
    event.preventDefault();
    if (code.length === CODE_LENGTH && preview) join(code);
  }

  const songs = player.queue.length;

  return (
    <div className="grid gap-4 md:grid-cols-[1fr_1.15fr]">
      <section className="card flex flex-col gap-3 p-5">
        <h2 className="text-base font-semibold text-white">Start a room</h2>
        <p className="text-sm text-blue-200">
          {songs > 0 && player.current
            ? `Starts from what you're playing: "${player.current.title}", ${songs === 1 ? 'one song' : `${songs} songs`} in the queue.`
            : "Starts with an empty queue. Once you're in, Play on any song adds it."}
        </p>
        <button onClick={() => void start()} disabled={isStarting || isJoining} className="btn-primary btn-md mt-auto w-full">
          {isStarting ? 'Starting…' : 'Start a room'}
        </button>
      </section>

      {/* The larger panel: joining is what everyone but the host does. */}
      <form onSubmit={onJoin} className="card flex flex-col gap-3 p-5">
        <h2 className="text-base font-semibold text-white">Join with a code</h2>
        <label htmlFor="room-code" className="text-sm text-blue-200">
          Six letters, from whoever started the room.
        </label>
        {/* Wide tracking and capitals because it's a code, read letter by letter, not a label. */}
        <input
          id="room-code"
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase().replace(CODE_CHARS, '').slice(0, CODE_LENGTH))}
          inputMode="text"
          autoCapitalize="characters"
          autoComplete="off"
          spellCheck={false}
          placeholder="ABCDEF"
          className="input font-display max-w-64 text-3xl font-extrabold tracking-[0.3em]"
        />
        <p className="min-h-5 text-sm" aria-live="polite">
          {lookup === 'looking' && <span className="text-blue-300">Looking for that room…</span>}
          {lookup === 'missing' && <span className="text-red-300">No room with that code. Check the letters with the host.</span>}
          {lookup === 'failed' && <span className="text-red-300">Couldn't check that code. Try again in a moment.</span>}
          {preview && (
            <span className="text-blue-100">
              {preview.members.join(', ')} {preview.members.length === 1 ? 'is' : 'are'} in
              {preview.nowPlaying
                ? `, listening to "${preview.nowPlaying.title}"${preview.nowPlaying.artist ? ` by ${preview.nowPlaying.artist}` : ''}.`
                : ', nothing playing yet.'}
            </span>
          )}
        </p>
        <button type="submit" disabled={!preview || isJoining} className="btn-primary btn-md self-start">
          {isJoining ? 'Joining…' : 'Join'}
        </button>
      </form>
    </div>
  );
}

type Choice<K extends keyof RoomSettings> = { value: RoomSettings[K]; label: string };

/** Each setting, its choices in the order shown, and what the first line of the card says about it. */
const SETTING_ROWS: { [K in keyof RoomSettings]: { label: string; choices: Choice<K>[] } } = {
  turns: { label: 'Order', choices: [{ value: false, label: 'As added' }, { value: true, label: 'Take turns' }] },
  shuffle: { label: 'Shuffle', choices: [{ value: false, label: 'Off' }, { value: true, label: 'On' }] },
  repeat: {
    label: 'Repeat',
    choices: [
      { value: 'off', label: 'Off' },
      { value: 'all', label: 'Queue' },
      { value: 'one', label: 'Song' },
    ],
  },
  skip: {
    label: 'Skipping',
    choices: [
      { value: 'vote', label: 'Vote' },
      { value: 'everyone', label: 'Anyone' },
      { value: 'host', label: 'Host only' },
    ],
  },
  playback: { label: 'Play, pause, seek', choices: [{ value: 'everyone', label: 'Anyone' }, { value: 'host', label: 'Host only' }] },
  add: { label: 'Add songs', choices: [{ value: 'everyone', label: 'Anyone' }, { value: 'host', label: 'Host only' }] },
  editQueue: {
    label: "Move or remove others' songs",
    choices: [
      { value: 'everyone', label: 'Anyone' },
      { value: 'host', label: 'Host only' },
    ],
  },
  invite: { label: 'Invite people', choices: [{ value: 'everyone', label: 'Anyone' }, { value: 'host', label: 'Host only' }] },
};

/**
 * The room's settings, opened from the button by the room code. The host picks; everyone else sees the same rows,
 * read-only, so they know why a control is off (A253).
 */
function RoomSettingsDialog({ settings, isHost, onChange, onClose }: {
  settings: RoomSettings;
  isHost: boolean;
  onChange: (change: Partial<RoomSettings>) => void;
  onClose: () => void;
}) {
  useScrollLock();
  const dialogRef = useDialogA11y<HTMLDivElement>(onClose);
  return (
    <div className="motion-scrim fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        tabIndex={-1}
        aria-labelledby="room-settings-heading"
        className="motion-pop card flex max-h-full w-full max-w-lg flex-col gap-3 overflow-y-auto p-5 outline-none"
        onClick={(e) => e.stopPropagation()}
      >
          <div className="flex items-center justify-between gap-3">
            <h2 id="room-settings-heading" className="text-base font-semibold text-white">
              Room settings{isHost ? '' : ' (the host sets these)'}
            </h2>
            <button onClick={onClose} className="btn-ghost btn-sm h-9 w-9 !px-0" aria-label="Close room settings">
              <CloseIcon className="h-4 w-4" />
            </button>
          </div>
          <dl className="flex flex-col divide-y divide-blue-800/60 rounded-md border border-blue-800">
            {(Object.keys(SETTING_ROWS) as (keyof RoomSettings)[]).map((key) => {
              const row = SETTING_ROWS[key] as { label: string; choices: { value: unknown; label: string }[] };
              const current = row.choices.find((c) => c.value === settings[key]);
              return (
                <div key={key} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5">
                  <dt className="text-sm text-white">{row.label}</dt>
                  <dd>
                    {isHost ? (
                      <div role="group" aria-label={row.label} className="flex flex-wrap gap-1">
                        {row.choices.map((choice) => {
                          const active = choice.value === settings[key];
                          return (
                            <button
                              key={String(choice.value)}
                              type="button"
                              aria-pressed={active}
                              onClick={() => !active && onChange({ [key]: choice.value } as Partial<RoomSettings>)}
                              className={`rounded-md border px-2.5 py-1 text-sm transition-colors ${
                                active
                                  ? 'border-orange-600 bg-blue-800 text-white'
                                  : 'border-blue-700 text-blue-300 hover:border-blue-500 hover:text-white'
                              }`}
                            >
                              {choice.label}
                            </button>
                          );
                        })}
                      </div>
                    ) : (
                      <span className="text-sm text-blue-200">{current?.label}</span>
                    )}
                  </dd>
                </div>
              );
            })}
          </dl>
          <p className="text-xs text-blue-400">
            {settings.skip === 'vote'
              ? "Vote: whoever added a song skips it at once. Anyone else's Next is a vote, the host's too, and the songs the room started with always take one; more than half of the people here skips it (with two of you, one vote)."
              : settings.skip === 'everyone'
                ? 'Anyone: Next skips at once, whoever presses it.'
                : 'Host only: only the host can skip.'}
            {settings.turns ? " Take turns plays one song from each person in turn, so songs can't be moved by hand." : ''}
          </p>
      </div>
    </div>
  );
}

/** Pick accounts to invite. They get a banner on the web and a notification on Android (A255). */
function InvitePanel({ onClose }: { onClose: () => void }) {
  const { showToast } = useToast();
  const [picked, setPicked] = useState<Set<number>>(new Set());
  const people = useQuery({
    queryKey: ['rooms', 'invitable'],
    queryFn: () =>
      apiClient.get<{ people: SocialPerson[] }>('/rooms/invitable').catch((error: unknown) => {
        reportRoomIssue('request-failed', "Couldn't load the invite list", { error });
        throw error;
      }),
  });
  const send = useMutation({
    mutationFn: (userIds: number[]) => apiClient.post<{ invited: number }>('/rooms/invites', { userIds }),
    onSuccess: ({ invited }, userIds) => {
      showToast(
        invited === 0
          ? 'They already have an invite.'
          : `Invite sent to ${invited === 1 && userIds.length === 1 ? 'them' : `${invited} people`}.`,
      );
      onClose();
    },
    onError: (error) => {
      reportRoomIssue('request-failed', "Couldn't send an invite", { error });
      showToast(error instanceof ApiError ? error.message : "Couldn't send the invite.", 'error');
    },
  });

  function toggle(id: number) {
    setPicked((now) => {
      const next = new Set(now);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const list = people.data?.people ?? [];
  return (
    <section className="card flex flex-col gap-3 p-5" aria-labelledby="invite-heading">
      <div className="flex items-center justify-between gap-2">
        <h2 id="invite-heading" className="text-base font-semibold text-white">
          Invite people
        </h2>
        <button onClick={onClose} className="btn-ghost btn-sm" aria-label="Close invites">
          <CloseIcon className="h-4 w-4" />
        </button>
      </div>
      {people.isPending ? (
        <p className="text-sm text-blue-300">Loading people…</p>
      ) : people.isError ? (
        <p className="text-sm text-blue-200">
          Couldn't load the list.{' '}
          <button onClick={() => void people.refetch()} className="underline underline-offset-2">
            Try again
          </button>
        </p>
      ) : list.length === 0 ? (
        <p className="text-sm text-blue-300">
          Everyone with an account is already here. Guests join with the code or the link.
        </p>
      ) : (
        <ul className="flex max-h-72 flex-col overflow-y-auto">
          {list.map((person) => (
            <li key={person.id}>
              <label className="flex cursor-pointer items-center gap-3 rounded-md px-2 py-1.5 hover:bg-blue-900">
                <input
                  type="checkbox"
                  checked={picked.has(person.id)}
                  onChange={() => toggle(person.id)}
                  className="h-4 w-4 accent-orange-600"
                />
                <Avatar userId={person.id} name={person.name} avatarId={person.avatarId} size="xs" />
                <span className="min-w-0 flex-1 truncate text-sm text-white">{person.name}</span>
              </label>
            </li>
          ))}
        </ul>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={() => send.mutate([...picked])}
          disabled={picked.size === 0 || picked.size > 8 || send.isPending}
          className="btn-primary btn-md"
        >
          {send.isPending ? 'Sending…' : picked.size > 1 ? `Invite ${picked.size} people` : 'Send invite'}
        </button>
        <p className="text-xs text-blue-400">Guests aren't listed: send them the link.</p>
      </div>
    </section>
  );
}

function InsideRoom({ room }: { room: RoomState }) {
  const { you, connection, send, leave } = useRoom();
  const { user } = useAuth();
  const { showToast } = useToast();
  const [confirmEnd, setConfirmEnd] = useState(false);
  const [inviting, setInviting] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const isHost = room.hostUserId === you;
  const canPlayback = roomAllows(room, you, 'playback');
  const canEdit = (entry: { addedBy: number }) => entry.addedBy === you || roomAllows(room, you, 'editQueue');
  const canInvite = !user?.isGuest && roomAllows(room, you, 'invite');
  const turns = room.settings?.turns ?? false;
  const vote = room.skipVote;
  const playing = room.queue[room.current];
  const upNext = room.queue.slice(room.current + 1);
  const played = room.current > 0 ? room.current : 0;

  // The link, not the bare code: it opens the Android app where it's installed, and this page everywhere else.
  async function copyLink() {
    if (await copyText(roomLinkFor(room.code))) {
      showToast('Room link copied.');
    } else {
      showToast(`Couldn't copy. The code is ${room.code}.`, 'error');
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <section className="card flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-col gap-2">
          <h2 className="text-sm font-semibold text-blue-200">Room code</h2>
          <CodeTiles code={room.code} />
          <p className="text-sm" aria-live="polite">
            {connection === 'live' ? (
              <span className="text-blue-200">In step with the room.</span>
            ) : (
              // Accent text on a card is `accent-ink` (DESIGN.md): orange-400 measured 4.36:1 on the card.
              <span className="text-accent-ink">Reconnecting… the music carries on here.</span>
            )}
          </p>
        </div>
        <div className="flex flex-wrap gap-2 sm:flex-col sm:items-end">
          {canInvite && (
            <button onClick={() => setInviting((v) => !v)} aria-expanded={inviting} className="btn-primary btn-md">
              Invite people
            </button>
          )}
          <button onClick={() => void copyLink()} className="btn-secondary btn-md">
            Copy link
          </button>
          {room.settings && (
            <button onClick={() => setShowSettings(true)} className="btn-secondary btn-md inline-flex items-center gap-2">
              <GearIcon className="h-4 w-4" />
              Room settings
            </button>
          )}
          <button onClick={leave} className="btn-ghost btn-md">
            Leave room
          </button>
          {isHost &&
            (confirmEnd ? (
              <span className="flex gap-2">
                <button onClick={() => send({ op: 'end' })} className="btn-danger btn-md">
                  End for everyone
                </button>
                <button onClick={() => setConfirmEnd(false)} className="btn-ghost btn-md">
                  Keep it
                </button>
              </span>
            ) : (
              <button onClick={() => setConfirmEnd(true)} className="btn-ghost btn-md">
                End room
              </button>
            ))}
        </div>
      </section>

      {inviting && <InvitePanel onClose={() => setInviting(false)} />}
      {showSettings && room.settings && (
        <RoomSettingsDialog
          settings={room.settings}
          isHost={isHost}
          onChange={(change) => send({ op: 'settings', settings: change })}
          onClose={() => setShowSettings(false)}
        />
      )}

      <div className="grid gap-5 lg:grid-cols-[1.6fr_1fr]">
        <section className="flex min-w-0 flex-col gap-3">
          <h2 className="text-sm font-semibold text-blue-200">Now playing</h2>
          {playing ? (
            <div className="card flex items-center gap-3 border-orange-600 p-4">
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <MarqueeText key={playing.entryId} text={playing.title} className="font-display text-3xl font-extrabold text-white" />
                <span className="truncate text-sm text-blue-200">
                  {playing.artist ?? 'Unknown Artist'}
                  {room.playback.playing ? '' : ' · paused'}
                </span>
                {vote && vote.entryId === playing.entryId && vote.votes.length > 0 && (
                  <span className="text-sm text-accent-ink" aria-live="polite">
                    {vote.votes.length} of {vote.needed} {vote.needed === 1 ? 'vote' : 'votes'} to skip
                    {you !== null && vote.votes.includes(you) ? ', yours included' : ''}
                  </span>
                )}
              </div>
            </div>
          ) : (
            <p className="card p-4 text-sm text-blue-200">
              The queue is empty. Press Play on any song in Library, Albums or Artists to add it here for everyone.
            </p>
          )}

          <h2 className="mt-2 text-sm font-semibold text-blue-200">
            Up next{upNext.length > 0 ? ` (${upNext.length})` : ''}
          </h2>
          {upNext.length === 0 ? (
            <p className="text-sm text-blue-300">Nothing after this. Play on any song adds it after the current one.</p>
          ) : (
            <ol className="card divide-y divide-blue-800/60">
              {upNext.map((entry, i) => {
                const at = room.current + 1 + i;
                return (
                  <li key={entry.entryId} className="flex items-center gap-2 py-1.5 pl-3 pr-2">
                    <AddedBy
                      person={{ userId: entry.addedBy, name: entry.addedByName ?? '', avatarId: entry.addedByAvatarId ?? null }}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm text-white">{entry.title}</span>
                      <span className="block truncate text-xs text-blue-300">{entry.artist ?? 'Unknown Artist'}</span>
                    </span>
                    <button
                      onClick={() => send({ op: 'jump', entryId: entry.entryId })}
                      disabled={!canPlayback}
                      className="btn-ghost btn-sm"
                      aria-label={`Play "${entry.title}" now, for everyone`}
                      title="Play now"
                    >
                      <PlayIcon className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={() => send({ op: 'move', entryId: entry.entryId, toIndex: at - 1 })}
                      disabled={i === 0 || turns || !canEdit(entry)}
                      className="btn-ghost btn-sm"
                      aria-label={`Move "${entry.title}" up`}
                      title="Move up"
                    >
                      <ArrowUpIcon className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={() => send({ op: 'move', entryId: entry.entryId, toIndex: at + 1 })}
                      disabled={i === upNext.length - 1 || turns || !canEdit(entry)}
                      className="btn-ghost btn-sm"
                      aria-label={`Move "${entry.title}" down`}
                      title="Move down"
                    >
                      <ArrowUpIcon className="h-3.5 w-3.5 rotate-180" />
                    </button>
                    <button
                      onClick={() => send({ op: 'remove', entryId: entry.entryId })}
                      disabled={!canEdit(entry)}
                      className="btn-ghost btn-sm"
                      aria-label={`Remove "${entry.title}" from the queue`}
                      title="Remove"
                    >
                      <CloseIcon className="h-3.5 w-3.5" />
                    </button>
                  </li>
                );
              })}
            </ol>
          )}
          {played > 0 && (
            <p className="text-xs text-blue-400">
              {played === 1 ? 'One song' : `${played} songs`} already played. Previous goes back to them.
            </p>
          )}
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-semibold text-blue-200">In the room ({room.members.length} of 8)</h2>
          <ul className="card divide-y divide-blue-800/60">
            {room.members.map((m) => (
              <li key={m.userId} className="flex items-center gap-3 py-2 pl-4 pr-2">
                <span className={m.connected ? '' : 'opacity-50'}>
                  <Avatar userId={m.userId} name={m.name} avatarId={m.avatarId ?? null} />
                </span>
                <span className="min-w-0 flex-1 truncate text-sm text-white">
                  {/* An account's name opens its profile; the room keeps playing (A172, A173). Guests have none. */}
                  {m.kind === 'account' ? (
                    <Link to={`/people/${m.userId}`} className="underline-offset-2 hover:underline">
                      {m.name}
                    </Link>
                  ) : (
                    m.name
                  )}
                  {m.userId === you && <span className="ml-2 text-xs text-blue-300">you</span>}
                </span>
                {m.userId === room.hostUserId && <span className="badge-admin">Host</span>}
                {m.kind === 'guest' && <span className="badge-neutral">Guest</span>}
                {!m.connected && <span className="badge-caution">Away</span>}
                {isHost && m.userId !== you && (
                  <button
                    onClick={() => send({ op: 'kick', userId: m.userId })}
                    className="btn-ghost btn-sm"
                    aria-label={`Remove ${m.name} from the room`}
                  >
                    Remove
                  </button>
                )}
              </li>
            ))}
          </ul>
          <p className="text-xs text-blue-400">
            Away means their connection dropped; they're kept for 2 minutes.
          </p>

        </section>
      </div>
    </div>
  );
}

export function TogetherPage() {
  const { room, isJoining, join, leave } = useRoom();
  const { user } = useAuth();
  // Read once, then dropped, so the code from a room link is used one time (see `lib/roomLink.ts`).
  const [linked, setLinked] = useState(pendingRoomLink);
  useEffect(clearRoomLink, []);
  const switchTo = room && linked && linked !== room.code ? linked : null;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold text-white">Listen together</h1>
        <p className="text-sm text-blue-300">
          Everyone in a room hears the same song at the same moment, wherever they are.
          {user?.isGuest ? " Guests can join and use the room's controls." : ''}
        </p>
      </div>
      {switchTo && (
        // Already in a room: the link's room is offered, not joined, so nobody is pulled out of one unasked.
        <section className="card flex flex-wrap items-center gap-3 p-5" aria-live="polite">
          <p className="flex-1 text-sm text-blue-200">
            The link was for room <span className="font-semibold text-white">{switchTo}</span>. Switching leaves this one.
          </p>
          <button
            onClick={() => {
              setLinked(null);
              leave();
              join(switchTo);
            }}
            className="btn-primary btn-md"
          >
            Switch rooms
          </button>
          <button onClick={() => setLinked(null)} className="btn-ghost btn-md">
            Stay here
          </button>
        </section>
      )}
      {room ? (
        <InsideRoom room={room} />
      ) : isJoining ? (
        // Retries until the server answers, so this can last if the server is down: Stop gets back out.
        <div className="card flex flex-wrap items-center gap-3 p-5" aria-live="polite">
          <p className="flex-1 text-sm text-blue-200">Joining the room… If this takes long, the server may be down.</p>
          <button onClick={leave} className="btn-ghost btn-md">
            Stop
          </button>
        </div>
      ) : (
        <OutsideRoom linked={linked} />
      )}
    </div>
  );
}
