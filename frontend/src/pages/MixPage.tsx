import { useQuery } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { SongRows, toQueue } from '../components/ListeningParts';
import { MixCover } from '../components/MixCover';
import { usePlayer } from '../components/PlayerBar';
import { Skeleton, SkeletonDetailHeader, SkeletonTrackRows } from '../components/Skeleton';
import { fetchDailyMixes } from '../lib/mix';

/** A shuffled copy, for the Shuffle button. */
function shuffled<T>(items: T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

/**
 * One of today's mixes as a list of its songs (owner, 2026-10-21), opened from the library's Mixes menu. Play goes on
 * as a radio from the first song after the mix ends, as the menu's pick did.
 */
export function MixPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const { startRadio, inRoom } = usePlayer();
  // The same query as the Mixes menu, so opening a mix from it costs no request.
  const mixes = useQuery({
    queryKey: ['mix', 'daily', user?.id],
    queryFn: fetchDailyMixes,
    staleTime: 30 * 60 * 1000,
    enabled: user != null && !user.isGuest,
  });

  if (mixes.isLoading) {
    return (
      <Skeleton label="Loading mix…">
        <SkeletonDetailHeader cover />
        <SkeletonTrackRows />
      </Skeleton>
    );
  }
  if (mixes.isError) return <p className="text-sm text-red-300">Could not load today's mixes. Reload to try again.</p>;

  const mix = mixes.data?.mixes.find((m) => m.id === Number(id));
  if (!mix) {
    return (
      <p className="text-sm text-blue-200">
        This mix isn't in today's mixes any more; they change every day.{' '}
        <Link to="/" className="text-accent-ink underline-offset-2 hover:underline">
          Open the library
        </Link>{' '}
        for today's.
      </p>
    );
  }

  const queue = toQueue(mix.tracks);
  const play = (tracks: typeof queue) => tracks[0] && startRadio(tracks[0], tracks);

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-5 sm:flex-row sm:items-end">
        <MixCover tracks={mix.tracks} large />
        <div className="min-w-0">
          <span className="font-mono text-xs uppercase tracking-widest text-blue-400">Mix</span>
          <h1 className="font-display text-3xl font-extrabold text-white sm:text-4xl">{mix.name} mix</h1>
          <p className="text-sm text-blue-300">
            {mix.tracks.length === 1 ? '1 song' : `${mix.tracks.length} songs`} · today, from what you play
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <button type="button" disabled={inRoom} onClick={() => play(queue)} className="btn-primary btn-md">
              Play
            </button>
            <button type="button" disabled={inRoom} onClick={() => play(shuffled(queue))} className="btn-secondary btn-md">
              Shuffle
            </button>
            {inRoom && <span className="text-xs text-blue-300">Mixes are off in a room.</span>}
          </div>
        </div>
      </header>
      <SongRows tracks={mix.tracks} />
    </div>
  );
}
