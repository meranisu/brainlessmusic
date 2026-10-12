import { useEffect, useState, type FormEvent } from 'react';
import { useAuth } from '../auth/AuthContext';
import { usePlayer } from '../components/PlayerBar';
import { useRoom } from '../components/RoomProvider';
import { useToast } from '../components/ToastProvider';
import { ArrowUpIcon, CloseIcon, PlayIcon } from '../components/icons';
import { ApiError, apiClient } from '../lib/apiClient';
import type { RoomState } from '../lib/roomClient';
import { ROOM_CODE_CHARS, ROOM_CODE_LENGTH, clearRoomLink, pendingRoomLink, roomLinkFor } from '../lib/roomLink';

/**
 * "Listen together" (A102): start or join a room, then see who's in it and the shared queue. Everyone controls
 * everything; only the host ends the room or removes people (A101). Guests join with full controls (A100).
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
        setResult({ code, preview: null, failed: err instanceof ApiError && err.status === 404 ? 'missing' : 'failed' });
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
        <button onClick={() => void start()} disabled={isStarting || isJoining} className="btn-primary btn-md mt-auto self-start">
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

function InsideRoom({ room }: { room: RoomState }) {
  const { you, connection, send, leave } = useRoom();
  const { showToast } = useToast();
  const [confirmEnd, setConfirmEnd] = useState(false);
  const isHost = room.hostUserId === you;
  const playing = room.queue[room.current];
  const upNext = room.queue.slice(room.current + 1);
  const played = room.current > 0 ? room.current : 0;

  // The link, not the bare code: it opens the Android app where it's installed, and this page everywhere else.
  async function copyLink() {
    try {
      await navigator.clipboard.writeText(roomLinkFor(room.code));
      showToast('Room link copied.');
    } catch {
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
          <button onClick={() => void copyLink()} className="btn-secondary btn-md">
            Copy link
          </button>
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

      <div className="grid gap-5 lg:grid-cols-[1.6fr_1fr]">
        <section className="flex min-w-0 flex-col gap-3">
          <h2 className="text-sm font-semibold text-blue-200">Now playing</h2>
          {playing ? (
            <div className="card flex flex-col gap-1 border-orange-600 p-4">
              <span className="font-display truncate text-3xl font-extrabold text-white">{playing.title}</span>
              <span className="truncate text-sm text-blue-200">
                {playing.artist ?? 'Unknown Artist'}
                {room.playback.playing ? '' : ' · paused'}
              </span>
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
                  <li key={entry.entryId} className="flex items-center gap-2 py-1.5 pl-4 pr-2">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm text-white">{entry.title}</span>
                      <span className="block truncate text-xs text-blue-300">{entry.artist ?? 'Unknown Artist'}</span>
                    </span>
                    <button
                      onClick={() => send({ op: 'jump', entryId: entry.entryId })}
                      className="btn-ghost btn-sm"
                      aria-label={`Play "${entry.title}" now, for everyone`}
                      title="Play now"
                    >
                      <PlayIcon className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={() => send({ op: 'move', entryId: entry.entryId, toIndex: at - 1 })}
                      disabled={i === 0}
                      className="btn-ghost btn-sm"
                      aria-label={`Move "${entry.title}" up`}
                      title="Move up"
                    >
                      <ArrowUpIcon className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={() => send({ op: 'move', entryId: entry.entryId, toIndex: at + 1 })}
                      disabled={i === upNext.length - 1}
                      className="btn-ghost btn-sm"
                      aria-label={`Move "${entry.title}" down`}
                      title="Move down"
                    >
                      <ArrowUpIcon className="h-3.5 w-3.5 rotate-180" />
                    </button>
                    <button
                      onClick={() => send({ op: 'remove', entryId: entry.entryId })}
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
              <li key={m.userId} className="flex items-center gap-2 py-2 pl-4 pr-2">
                <span className="min-w-0 flex-1 truncate text-sm text-white">
                  {m.name}
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
            Anyone here can pause, skip and change the queue. Away means their connection dropped; they're kept for 2
            minutes.
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
          {user?.isGuest ? ' Guests can join and use every control.' : ''}
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
