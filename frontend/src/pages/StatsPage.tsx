import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { RangePicker, Section, SongRows } from '../components/ListeningParts';
import { usePlayer, type QueueTrack } from '../components/PlayerBar';
import { Skeleton, SkeletonDetailHeader, SkeletonTrackRows } from '../components/Skeleton';
import { apiClient } from '../lib/apiClient';
import { formatSince, formatTotalLength } from '../lib/format';
import type { HistoryEntry, HistoryPage, ListeningPatterns, MyStats, StatsRange } from '../types/api';

/**
 * Your own listening as a play record (stats dashboard, A227-A230): time and plays against the window before, the day
 * combo (streak), plays over the range, when in the day and week you listen, the top lists, and recently played.
 * Hours and days are in this browser's zone, which the server buckets in.
 */

const HISTORY_PAGE = 50;
const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const TIME_ZONE = Intl.DateTimeFormat().resolvedOptions().timeZone;

/** `YYYY-MM-DD` as a short local date ("3 Oct"); the string is already a local day, so it is read as UTC. */
function shortDay(date: string): string {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString(undefined, { day: 'numeric', month: 'short', timeZone: 'UTC' });
}

const hourLabel = (h: number) => `${h.toString().padStart(2, '0')}:00`;
const minutes = (ms: number) => Math.round(ms / 60_000);
const plural = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString()} ${n === 1 ? one : many}`;

/** "up 12% on the 30 days before", or nothing when there is no earlier window or it was empty. */
function change(now: number, before: number | undefined, range: StatsRange): string | null {
  if (before === undefined || before === 0) return null;
  const pct = Math.round(((now - before) / before) * 100);
  const window = { week: '7 days', month: '30 days', year: '365 days', all: '' }[range];
  if (pct === 0) return `level with the ${window} before`;
  return `${pct > 0 ? 'up' : 'down'} ${Math.abs(pct)}% on the ${window} before`;
}

/**
 * Flat bars, tallest scaled to the box. The busiest bar takes the accent, the one place it shows on the page; the
 * rest stay in the theme's blue. Every bar carries its value as a tooltip, and the summary is the accessible name.
 */
function Bars({
  values,
  titles,
  summary,
  height = 'h-32',
}: {
  values: number[];
  titles: string[];
  summary: string;
  height?: string;
}) {
  const max = Math.max(...values, 0);
  const top = max > 0 ? values.indexOf(max) : -1;
  // Hundreds of bars (a year of days) can't spare a gap each.
  const gap = values.length > 60 ? 'gap-0' : 'gap-px sm:gap-0.5';
  return (
    <div role="img" aria-label={summary} className={`flex ${height} items-end ${gap}`}>
      {values.map((v, i) => (
        <div
          key={i}
          title={titles[i]}
          className={`min-w-0 flex-1 ${i === top ? 'bg-orange-600' : v > 0 ? 'bg-blue-500' : 'bg-blue-800/60'}`}
          style={{ height: v > 0 ? `${Math.max(3, (v / max) * 100)}%` : '2px' }}
        />
      ))}
    </div>
  );
}

/** Plays (or minutes) per day or week over the range; minutes count skips too, plays don't. */
function TrendChart({ patterns, rangeLabel }: { patterns: ListeningPatterns; rangeLabel: string }) {
  const [measure, setMeasure] = useState<'plays' | 'minutes'>('plays');
  const { trend, bucket } = patterns;
  const values = trend.map((p) => (measure === 'plays' ? p.plays : minutes(p.msListened)));
  const unit = measure === 'plays' ? 'play' : 'minute';
  const per = bucket === 'week' ? 'week' : 'day';
  const title = `${measure === 'plays' ? 'Plays' : 'Minutes'} per ${per}, ${rangeLabel}`;
  const titles = trend.map(
    (p, i) => `${bucket === 'week' ? 'Week of ' : ''}${shortDay(p.date)}: ${plural(values[i], unit)}${p.skips ? `, ${p.skips} skipped` : ''}`,
  );
  const max = Math.max(...values, 0);
  const peak = max > 0 ? trend[values.indexOf(max)] : null;
  return (
    <section className="card flex flex-col gap-3 p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-white">{title}</h2>
        <div role="group" aria-label="Measure" className="flex gap-1">
          {(['plays', 'minutes'] as const).map((m) => (
            <button
              key={m}
              type="button"
              aria-pressed={measure === m}
              onClick={() => setMeasure(m)}
              className={`rounded-md border px-2.5 py-1 text-xs transition-colors ${
                measure === m ? 'border-orange-600 bg-blue-800 text-white' : 'border-blue-700 text-blue-300 hover:text-white'
              }`}
            >
              {m === 'plays' ? 'Plays' : 'Minutes'}
            </button>
          ))}
        </div>
      </div>
      {trend.length === 0 ? (
        <p className="text-sm text-blue-300">Nothing played yet. Your first play starts the chart.</p>
      ) : (
        <>
          <Bars
            values={values}
            titles={titles}
            summary={`${title}. ${peak ? `Most: ${plural(max, unit)} ${bucket === 'week' ? 'in the week of' : 'on'} ${shortDay(peak.date)}.` : 'None yet.'}`}
          />
          <div className="flex justify-between font-mono text-xs tabular-nums text-blue-300">
            <span>{shortDay(trend[0].date)}</span>
            {peak && (
              <span className="text-blue-200">
                Most: {plural(max, unit)}, {bucket === 'week' ? 'week of ' : ''}
                {shortDay(peak.date)}
              </span>
            )}
            <span>{bucket === 'week' ? 'this week' : 'today'}</span>
          </div>
        </>
      )}
    </section>
  );
}

function WhenYouListen({ patterns }: { patterns: ListeningPatterns }) {
  const { byHour, byWeekday, busiest } = patterns;
  const hourTitles = byHour.map((b, h) => `${hourLabel(h)}: ${plural(b.plays, 'play')}`);
  const dayTitles = byWeekday.map((b, d) => `${WEEKDAYS[d]}: ${plural(b.plays, 'play')}`);
  const hourSummary =
    busiest.hour === null ? 'No plays in this range.' : `Busiest hour ${hourLabel(busiest.hour)}, ${plural(byHour[busiest.hour].plays, 'play')}.`;
  const daySummary =
    busiest.weekday === null ? 'No plays in this range.' : `Busiest day ${WEEKDAYS[busiest.weekday]}, ${plural(byWeekday[busiest.weekday].plays, 'play')}.`;
  return (
    <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
      <section className="card flex flex-col gap-3 p-4 sm:p-5">
        <h2 className="text-sm font-semibold text-white">What time you listen</h2>
        <Bars values={byHour.map((b) => b.plays)} titles={hourTitles} summary={`Plays by hour of day. ${hourSummary}`} height="h-28" />
        <div className="grid grid-cols-4 font-mono text-xs tabular-nums text-blue-300">
          {[0, 6, 12, 18].map((h) => (
            <span key={h}>{hourLabel(h)}</span>
          ))}
        </div>
        <p className="text-xs text-blue-200">{hourSummary}</p>
      </section>
      <section className="card flex flex-col gap-3 p-4 sm:p-5">
        <h2 className="text-sm font-semibold text-white">Which days you listen</h2>
        <Bars values={byWeekday.map((b) => b.plays)} titles={dayTitles} summary={`Plays by day of the week. ${daySummary}`} height="h-28" />
        <div className="flex font-mono text-xs text-blue-300">
          {WEEKDAYS.map((d) => (
            <span key={d} className="flex-1 text-center">
              {d.slice(0, 2)}
            </span>
          ))}
        </div>
        <p className="text-xs text-blue-200">{daySummary}</p>
      </section>
    </div>
  );
}

/** The record band: the page's focal point. Time listened large, then plays, songs and artists, then the day combo. */
function Record({ stats, patterns, range }: { stats: MyStats; patterns: ListeningPatterns | undefined; range: StatsRange }) {
  const { totals, previousTotals } = stats;
  const delta = change(totals.msListened, previousTotals?.msListened, range);
  const streak = patterns?.streak;
  return (
    <section aria-label="Play record" className="card flex flex-col gap-5 p-4 sm:flex-row sm:items-end sm:justify-between sm:p-6">
      <div className="min-w-0">
        <p className="font-display text-6xl font-extrabold leading-none text-white tabular-nums sm:text-7xl">
          {formatTotalLength(Math.round(totals.msListened / 1000))}
        </p>
        <p className="mt-1 text-sm text-blue-200">
          listened{delta && <span className="text-blue-300">, {delta}</span>}
        </p>
        <dl className="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-sm">
          {(
            [
              ['Plays', totals.plays],
              ['Songs', totals.tracks],
              ['Artists', totals.artists],
            ] as const
          ).map(([label, n]) => (
            <div key={label} className="flex items-baseline gap-2">
              <dt className="text-blue-300">{label}</dt>
              <dd className="font-mono font-semibold tabular-nums text-white">{n.toLocaleString()}</dd>
            </div>
          ))}
        </dl>
      </div>
      {streak && (
        // A streak reads as a combo, the rhythm-game word the Android skins already use for songs in a row.
        <div className="shrink-0 border-t border-blue-700 pt-4 sm:border-l sm:border-t-0 sm:pl-6 sm:pt-0">
          <p className="font-mono text-xs uppercase tracking-wider text-blue-300">Day combo</p>
          <p className="font-display text-5xl font-extrabold leading-none text-white tabular-nums">{streak.current}</p>
          <p className="mt-1 text-xs text-blue-200">
            {streak.current === 0 ? 'Play something today to start one. ' : `${plural(streak.current, 'day')} in a row. `}
            {streak.longest > 0 && (
              <>
                Best {plural(streak.longest, 'day')}
                {streak.longestEndedOn && streak.longest > streak.current && `, ended ${shortDay(streak.longestEndedOn)}`}.
              </>
            )}
          </p>
        </div>
      )}
    </section>
  );
}

function toQueue(rows: HistoryEntry[]): QueueTrack[] {
  return rows.map((h) => ({
    id: h.trackId,
    title: h.title,
    artist: h.artist,
    duration: h.duration,
    gainDb: h.gainDb,
    format: h.format,
    albumId: h.albumId,
    trackNumber: h.trackNumber,
  }));
}

/** Every play, newest first, 50 at a time. A click plays from that song on, missing files left out. */
function RecentlyPlayed() {
  const { playQueue } = usePlayer();
  const [now] = useState(() => Date.now());
  const history = useInfiniteQuery({
    queryKey: ['me', 'history'],
    queryFn: ({ pageParam }) => apiClient.get<HistoryPage>(`/me/history?limit=${HISTORY_PAGE}&offset=${pageParam}`),
    initialPageParam: 0,
    getNextPageParam: (last) => (last.offset + last.history.length < last.total ? last.offset + last.history.length : undefined),
  });
  const rows = history.data?.pages.flatMap((p) => p.history) ?? [];
  const total = history.data?.pages[0]?.total ?? 0;

  let body;
  if (history.isLoading) body = <p className="text-sm text-blue-300">Loading your recent plays…</p>;
  else if (history.isError) body = <p className="text-sm text-red-300">Could not load your plays. Reload to try again.</p>;
  else if (rows.length === 0) body = <p className="text-sm text-blue-300">No plays yet. Songs you play show up here.</p>;
  else {
    const playable = rows.filter((r) => !r.missing);
    body = (
      <>
        <ol className="card divide-y divide-blue-800/60 overflow-hidden">
          {rows.map((r) => (
            <li key={r.id}>
              <button
                type="button"
                disabled={!!r.missing}
                onClick={() => playQueue(toQueue(playable), playable.indexOf(r))}
                className="flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-blue-800/40 focus-visible:bg-blue-800/40 disabled:cursor-not-allowed"
              >
                <span className="min-w-0 flex-1">
                  <span className={`block truncate text-sm font-medium ${r.skipped || r.missing ? 'text-blue-300' : 'text-white'}`}>{r.title}</span>
                  <span className="block truncate text-xs text-blue-300">
                    {r.artist ?? 'Unknown artist'}
                    {r.skipped ? ' · skipped' : ''}
                    {r.missing ? ' · file missing' : ''}
                  </span>
                </span>
                <span className="shrink-0 font-mono text-xs tabular-nums text-blue-300">{formatSince(r.playedAt, now)}</span>
              </button>
            </li>
          ))}
        </ol>
        {history.hasNextPage && (
          <button
            type="button"
            onClick={() => history.fetchNextPage()}
            disabled={history.isFetchingNextPage}
            className="btn-secondary btn-sm self-start"
          >
            {history.isFetchingNextPage ? 'Loading…' : `Show ${Math.min(HISTORY_PAGE, total - rows.length)} more`}
          </button>
        )}
      </>
    );
  }
  return (
    <Section title="Recently played" count={total || undefined}>
      {body}
    </Section>
  );
}

/** Stats, your listening in full (A228), shown as a tab on your own profile (owner, 2026-10-21). */
export function StatsPanel() {
  const [range, setRange] = useState<StatsRange>('month');
  const stats = useQuery({
    queryKey: ['me', 'stats', range],
    queryFn: () => apiClient.get<MyStats>(`/me/stats?range=${range}`),
    placeholderData: (prev) => prev,
  });
  const patterns = useQuery({
    queryKey: ['me', 'stats', 'patterns', range, TIME_ZONE],
    queryFn: () => apiClient.get<ListeningPatterns>(`/me/stats/patterns?range=${range}&tz=${encodeURIComponent(TIME_ZONE)}`),
    placeholderData: (prev) => prev,
  });

  const rangeLabel = range === 'all' ? 'all time' : `last ${{ week: '7', month: '30', year: '365' }[range]} days`;
  const dimmed = stats.isPlaceholderData || patterns.isPlaceholderData ? 'opacity-60' : '';

  let content;
  if (stats.isLoading) {
    content = (
      <Skeleton label="Loading your stats…">
        <SkeletonDetailHeader />
        <SkeletonTrackRows />
      </Skeleton>
    );
  } else if (stats.isError || !stats.data) {
    content = <p className="text-sm text-red-300">Could not load your stats. Reload to try again.</p>;
  } else {
    const data = stats.data;
    const nothing = range === 'all' ? 'Nothing played yet.' : `Nothing played in the ${rangeLabel}.`;
    content = (
      <div className={`flex flex-col gap-8 transition-opacity ${dimmed}`}>
        <Record stats={data} patterns={patterns.data} range={range} />
        {patterns.isError ? (
          <p className="text-sm text-red-300">Could not load when you listen. Reload to try again.</p>
        ) : patterns.data ? (
          <>
            <TrendChart patterns={patterns.data} rangeLabel={rangeLabel} />
            <WhenYouListen patterns={patterns.data} />
          </>
        ) : (
          <p className="text-sm text-blue-300">Loading when you listen…</p>
        )}

        <div className="grid gap-8 lg:grid-cols-2">
          <Section title="Top songs">
            {data.topTracks.length === 0 ? (
              <p className="text-sm text-blue-300">{nothing}</p>
            ) : (
              <SongRows
                tracks={data.topTracks.map((t) => t.track)}
                rank
                detail={(i) => plural(data.topTracks[i].plays, 'play')}
              />
            )}
          </Section>
          <div className="flex min-w-0 flex-col gap-8">
            <Section title="Top artists">
              {data.topArtists.length === 0 ? (
                <p className="text-sm text-blue-300">{nothing}</p>
              ) : (
                <ol className="card divide-y divide-blue-800/60 overflow-hidden">
                  {data.topArtists.map((a, i) => (
                    <li key={a.id}>
                      <Link
                        to={`/artists/${a.id}`}
                        className="flex items-baseline gap-3 px-4 py-2.5 transition-colors hover:bg-blue-800/40 focus-visible:bg-blue-800/40"
                      >
                        <span className="w-5 shrink-0 text-right font-mono text-xs tabular-nums text-blue-400">{i + 1}</span>
                        <span className="min-w-0 flex-1 truncate text-sm font-medium text-white">{a.name}</span>
                        <span className="shrink-0 font-mono text-xs tabular-nums text-blue-300">{plural(a.plays, 'play')}</span>
                      </Link>
                    </li>
                  ))}
                </ol>
              )}
            </Section>
            <Section title="Top albums">
              {data.topAlbums.length === 0 ? (
                <p className="text-sm text-blue-300">{nothing}</p>
              ) : (
                <ol className="card divide-y divide-blue-800/60 overflow-hidden">
                  {data.topAlbums.map((a, i) => (
                    <li key={a.id}>
                      <Link
                        to={`/albums/${a.id}`}
                        className="flex items-baseline gap-3 px-4 py-2.5 transition-colors hover:bg-blue-800/40 focus-visible:bg-blue-800/40"
                      >
                        <span className="w-5 shrink-0 text-right font-mono text-xs tabular-nums text-blue-400">{i + 1}</span>
                        <span className="min-w-0 flex-1 truncate text-sm">
                          <span className="font-medium text-white">{a.title}</span>
                          {a.artist && <span className="text-blue-300"> · {a.artist}</span>}
                        </span>
                        <span className="shrink-0 font-mono text-xs tabular-nums text-blue-300">{plural(a.plays, 'play')}</span>
                      </Link>
                    </li>
                  ))}
                </ol>
              )}
            </Section>
            <Section title="Top genres">
              {data.topGenres.length === 0 ? (
                <p className="text-sm text-blue-300">No genres yet. They come from the songs' genre tags.</p>
              ) : (
                <ul className="flex flex-wrap gap-2">
                  {data.topGenres.map((g) => (
                    <li key={g.id}>
                      <Link
                        to={`/genres/${g.id}`}
                        className="inline-flex items-baseline gap-2 rounded-md border border-blue-700 px-3 py-1.5 text-sm text-white transition-colors hover:border-orange-600"
                      >
                        {g.name}
                        <span className="font-mono text-xs tabular-nums text-blue-400">{g.plays}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </Section>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <RangePicker value={range} onChange={setRange} />
        <p className="text-xs text-blue-300">Times are in {TIME_ZONE.replace(/_/g, ' ')}.</p>
      </div>
      {content}
      <RecentlyPlayed />
    </div>
  );
}
