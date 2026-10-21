import type { TrackSummary } from '../types/api';
import { CoverArt } from './CoverArt';
import { RadioIcon } from './icons';

/** The first four different albums' covers, a song's own when it has no album. */
function coverSources(tracks: TrackSummary[]): { kind: 'tracks' | 'albums'; id: number }[] {
  const seen = new Set<string>();
  const out: { kind: 'tracks' | 'albums'; id: number }[] = [];
  for (const track of tracks) {
    const source = track.albumId != null ? { kind: 'albums' as const, id: track.albumId } : { kind: 'tracks' as const, id: track.id };
    const key = `${source.kind}:${source.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(source);
    if (out.length === 4) break;
  }
  return out;
}

/**
 * A mix's picture, as Spotify and YouTube Music draw theirs (owner, 2026-10-21): four of its covers in a grid, one
 * when there are fewer, and a radio mark at the bottom left saying it is a mix, not an album.
 */
export function MixCover({ tracks, large = false }: { tracks: TrackSummary[]; large?: boolean }) {
  const sources = coverSources(tracks);
  const box = large ? 'h-48 w-48 sm:h-56 sm:w-56' : 'h-10 w-10';
  const size = large ? 'full' : 'thumb';
  return (
    <span className={`relative block shrink-0 overflow-hidden rounded-md border border-blue-800 ${box}`}>
      {sources.length === 4 ? (
        <span className="grid h-full w-full grid-cols-2 grid-rows-2">
          {sources.map((s) => (
            <CoverArt key={`${s.kind}:${s.id}`} kind={s.kind} id={s.id} size={size} bare className="h-full w-full" />
          ))}
        </span>
      ) : (
        sources[0] && <CoverArt kind={sources[0].kind} id={sources[0].id} size={size} bare className="h-full w-full" />
      )}
      <span
        className={`absolute flex items-center justify-center rounded-full border border-blue-950 bg-orange-600 text-on-accent ${
          large ? 'bottom-2 left-2 h-9 w-9' : 'bottom-0.5 left-0.5 h-4 w-4'
        }`}
      >
        <RadioIcon className={large ? 'h-5 w-5' : 'h-2.5 w-2.5'} />
      </span>
    </span>
  );
}
