import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { apiClient } from '../lib/apiClient';
import type { LoudnessReport, LoudnessStatus, TrackLoudness } from '../types/api';

const POLL_INTERVAL_MS = 10_000;
const PAGE_SIZE = 50;
const SEARCH_DELAY_MS = 300;

const FILTERS: { id: LoudnessStatus | 'all'; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'levelled', label: 'Levelled' },
  { id: 'waiting', label: 'Waiting' },
  { id: 'failed', label: "Couldn't measure" },
];

const EMPTY_TEXT: Record<LoudnessStatus | 'all', string> = {
  all: 'No songs in the library yet.',
  levelled: 'No song has been measured yet. The server starts on the most recently played.',
  waiting: 'Every song has been measured.',
  failed: 'Every song the server tried could be measured.',
};

function formatDb(value: number): string {
  return `${value > 0 ? '+' : ''}${value.toFixed(1)} dB`;
}

function GainCell({ track }: { track: TrackLoudness }) {
  if (track.status === 'waiting') return <span className="text-blue-300">Waiting</span>;
  if (track.status === 'failed') return <span className="text-red-400">Couldn't measure</span>;
  if (track.gainDb === null) return <span className="text-blue-300">Silent</span>;
  return <span className="text-white">{formatDb(track.gainDb)}</span>;
}

/**
 * Which songs volume levelling has reached (owner request, 2026-10-12). The server measures in the background, most
 * recently played first, and a song measured after its queue was loaded only levels from its next play, so a song can
 * sound unlevelled here while it shows as levelled.
 */
export function LevellingPage() {
  const [filter, setFilter] = useState<LoudnessStatus | 'all'>('all');
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(0);
    }, SEARCH_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [searchInput]);

  const { data, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ['admin-loudness', filter, search, page],
    queryFn: () => {
      const params = new URLSearchParams({ limit: String(PAGE_SIZE), offset: String(page * PAGE_SIZE) });
      if (filter !== 'all') params.set('status', filter);
      if (search) params.set('search', search);
      return apiClient.get<LoudnessReport>(`/admin/loudness?${params.toString()}`);
    },
    refetchInterval: POLL_INTERVAL_MS,
    // Keeps the table up while the next page or filter loads, instead of blanking it.
    placeholderData: keepPreviousData,
  });

  const summary = data?.summary;
  const counts: Record<LoudnessStatus | 'all', number | undefined> = {
    all: summary?.total,
    levelled: summary?.levelled,
    waiting: summary?.waiting,
    failed: summary?.failed,
  };
  const fraction = summary && summary.total > 0 ? summary.levelled / summary.total : 0;
  const lastPage = data ? Math.max(Math.ceil(data.total / PAGE_SIZE) - 1, 0) : 0;

  return (
    <div>
      <div className="mb-5">
        <h2 className="text-base font-semibold text-white">Volume levelling</h2>
        <p className="mt-0.5 text-sm text-blue-300">
          Which songs the server has measured, and how much each is turned up or down. Auto-refreshes every 10s.
        </p>
      </div>

      {isLoading && <p className="text-sm text-blue-300">Loading…</p>}

      {isError && !data && (
        <div className="card flex flex-wrap items-center justify-between gap-3 px-4 py-4">
          <p className="text-sm text-blue-200">Couldn't load the levelling status.</p>
          <button onClick={() => void refetch()} disabled={isFetching} className="btn-secondary btn-sm">
            {isFetching ? 'Trying…' : 'Try again'}
          </button>
        </div>
      )}

      {data && summary && (
        <>
          <div className="card p-4">
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
              <p className="text-sm text-white">
                <span className="text-2xl font-semibold tabular-nums">{summary.levelled.toLocaleString()}</span>
                <span className="text-blue-300"> of {summary.total.toLocaleString()} songs levelled</span>
              </p>
              <p className="text-xs tabular-nums text-blue-300">{Math.floor(fraction * 100)}%</p>
            </div>
            <div
              role="progressbar"
              aria-label="Songs levelled"
              aria-valuemin={0}
              aria-valuemax={summary.total}
              aria-valuenow={summary.levelled}
              className="mt-2 h-2 overflow-hidden rounded-full bg-blue-950"
            >
              <div className="h-full rounded-full bg-orange-600" style={{ width: `${fraction * 100}%` }} />
            </div>
            <p className="mt-2 text-xs text-blue-300">
              {data.measuring ? (
                <>
                  Measuring now: <span className="text-blue-100">{data.measuring.title}</span>
                  {data.measuring.artist && <>, {data.measuring.artist}</>}
                </>
              ) : summary.waiting === 0 ? (
                'Every song is measured. New ones are measured after each scan or upload.'
              ) : (
                'Not measuring right now. It picks up again after the next scan, upload, restart, or when someone plays a waiting song.'
              )}
            </p>
          </div>

          <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div role="radiogroup" aria-label="Show" className="flex flex-wrap gap-1">
              {FILTERS.map((option) => {
                const selected = filter === option.id;
                return (
                  <button
                    key={option.id}
                    role="radio"
                    aria-checked={selected}
                    onClick={() => {
                      setFilter(option.id);
                      setPage(0);
                    }}
                    className={`min-h-11 rounded-md border px-3 py-1.5 text-sm transition-colors sm:min-h-0 ${
                      selected
                        ? 'border-orange-500 bg-orange-600/12 text-white'
                        : 'border-blue-800 text-blue-200 hover:border-blue-600'
                    }`}
                  >
                    {option.label}
                    {counts[option.id] !== undefined && (
                      <span className="ml-1.5 tabular-nums text-blue-300">{counts[option.id]!.toLocaleString()}</span>
                    )}
                  </button>
                );
              })}
            </div>
            <input
              type="search"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search title, artist or album"
              aria-label="Search songs"
              className="input sm:w-64"
            />
          </div>

          <div className="card mt-3 overflow-hidden">
            <table className="w-full table-fixed text-left text-sm">
              <thead className="border-b border-blue-800">
                <tr className="text-xs uppercase tracking-wide text-blue-400">
                  <th className="px-4 py-2.5 font-medium">Song</th>
                  <th className="hidden w-28 px-4 py-2.5 font-medium sm:table-cell">Loudness</th>
                  <th className="w-36 px-4 py-2.5 font-medium">Gain</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-blue-800/60">
                {data.tracks.map((track) => (
                  <tr key={track.id}>
                    <td className="px-4 py-2.5">
                      <p className="truncate text-blue-100">{track.title}</p>
                      {track.artist && <p className="truncate text-xs text-blue-300">{track.artist}</p>}
                    </td>
                    <td className="hidden px-4 py-2.5 tabular-nums text-blue-200 sm:table-cell">
                      {track.loudnessLufs !== null ? `${track.loudnessLufs.toFixed(1)} LUFS` : ''}
                    </td>
                    <td className="px-4 py-2.5 tabular-nums">
                      <GainCell track={track} />
                    </td>
                  </tr>
                ))}
                {data.tracks.length === 0 && (
                  <tr>
                    <td colSpan={3} className="px-4 py-8 text-center text-blue-300">
                      {search ? `No songs match "${search}".` : EMPTY_TEXT[filter]}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {data.total > PAGE_SIZE && (
            <div className="mt-3 flex items-center justify-between gap-3">
              <p className="text-xs tabular-nums text-blue-300">
                {(page * PAGE_SIZE + 1).toLocaleString()} to{' '}
                {Math.min((page + 1) * PAGE_SIZE, data.total).toLocaleString()} of {data.total.toLocaleString()}
              </p>
              <div className="flex gap-2">
                <button onClick={() => setPage(page - 1)} disabled={page === 0} className="btn-secondary btn-sm">
                  Previous
                </button>
                <button onClick={() => setPage(page + 1)} disabled={page >= lastPage} className="btn-secondary btn-sm">
                  Next
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
