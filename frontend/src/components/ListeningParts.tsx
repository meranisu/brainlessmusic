import { useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { CoverArt } from './CoverArt';
import { usePlayer, type QueueTrack } from './PlayerBar';
import { useRoom } from './RoomProvider';
import { useScrollLock } from '../hooks/useScrollLock';
import { formatDuration } from '../lib/format';
import type { StatsRange, TrackSummary } from '../types/api';

/** Parts shared by the profile page and the Stats page: the range picker, section headings and playable song rows. */

export const RANGES: { id: StatsRange; label: string }[] = [
  { id: 'week', label: 'Week' },
  { id: 'month', label: 'Month' },
  { id: 'year', label: 'Year' },
  { id: 'all', label: 'All time' },
];

export function RangePicker({ value, onChange }: { value: StatsRange; onChange: (range: StatsRange) => void }) {
  return (
    <div role="group" aria-label="Time range" className="flex flex-wrap gap-1">
      {RANGES.map((r) => (
        <button
          key={r.id}
          type="button"
          aria-pressed={value === r.id}
          onClick={() => onChange(r.id)}
          className={`rounded-md border px-3 py-1.5 text-sm transition-colors ${
            value === r.id
              ? 'border-orange-600 bg-blue-800 text-white'
              : 'border-blue-700 text-blue-300 hover:border-blue-500 hover:text-white'
          }`}
        >
          {r.label}
        </button>
      ))}
    </div>
  );
}

function toQueue(tracks: TrackSummary[]): QueueTrack[] {
  return tracks.map((t) => ({
    id: t.id,
    title: t.title,
    artist: t.artist,
    duration: t.duration,
    gainDb: t.gainDb,
    format: t.format,
    albumId: t.albumId,
    trackNumber: t.trackNumber,
  }));
}

export function Section({ title, count, children }: { title: string; count?: number; children: ReactNode }) {
  return (
    // min-w-0: as a grid item it would otherwise grow to its longest song title and push the page sideways.
    <section className="flex min-w-0 flex-col gap-3">
      <h2 className="flex items-baseline gap-2 text-sm font-semibold text-white">
        {title}
        {count !== undefined && <span className="font-mono text-xs font-normal tabular-nums text-blue-400">{count}</span>}
      </h2>
      {children}
    </section>
  );
}

/**
 * Songs as rows; a click plays the list from there. `rank` numbers them as a top list. In a room, Play adds to the
 * queue everyone hears, so it asks first (A173).
 */
export function SongRows({ tracks, rank, detail }: { tracks: TrackSummary[]; rank?: boolean; detail?: (i: number) => string }) {
  const { playQueue } = usePlayer();
  const { room } = useRoom();
  const [askingFor, setAskingFor] = useState<number | null>(null);
  const queue = toQueue(tracks);
  return (
    <>
      <ul className="card divide-y divide-blue-800/60 overflow-hidden">
        {tracks.map((t, i) => (
          <li key={t.id}>
            <button
              type="button"
              onClick={() => (room ? setAskingFor(i) : playQueue(queue, i))}
              className="flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-blue-800/40 focus-visible:bg-blue-800/40"
            >
              {rank && <span className="w-5 shrink-0 text-right font-mono text-xs tabular-nums text-blue-400">{i + 1}</span>}
              <CoverArt kind="tracks" id={t.id} className="h-9 w-9" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-white">{t.title}</span>
                <span className="block truncate text-xs text-blue-300">{t.artist ?? 'Unknown artist'}</span>
              </span>
              <span className="shrink-0 font-mono text-xs tabular-nums text-blue-300">
                {detail ? detail(i) : formatDuration(t.duration)}
              </span>
            </button>
          </li>
        ))}
      </ul>
      {askingFor !== null && room && (
        <RoomPlayDialog
          roomCode={room.code}
          title={tracks[askingFor].title}
          more={tracks.length - askingFor - 1}
          onConfirm={() => {
            playQueue(queue, askingFor);
            setAskingFor(null);
          }}
          onCancel={() => setAskingFor(null)}
        />
      )}
    </>
  );
}

/** "This goes to everyone": shown before a profile's song is added to the room you're in (A173). */
function RoomPlayDialog({
  roomCode,
  title,
  more,
  onConfirm,
  onCancel,
}: {
  roomCode: string;
  title: string;
  more: number;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  useScrollLock();
  return createPortal(
    <div className="motion-scrim fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4" onClick={onCancel}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="room-play-title"
        className="motion-pop card w-full max-w-sm p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="room-play-title" className="text-sm font-semibold text-white">
          Play this in room {roomCode}?
        </h2>
        <p className="mt-2 text-sm text-blue-200">
          <span className="text-white">{title}</span>
          {more > 0 && ` and the ${more === 1 ? 'song' : 'songs'} after it`} will go next in the room's queue, for
          everyone listening.
        </p>
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" onClick={onCancel} className="btn-secondary btn-sm">
            Cancel
          </button>
          <button type="button" onClick={onConfirm} className="btn-primary btn-sm" autoFocus>
            Play in the room
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
