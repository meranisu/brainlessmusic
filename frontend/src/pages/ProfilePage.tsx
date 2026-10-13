import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Link, useParams } from 'react-router-dom';
import { Avatar } from '../components/Avatar';
import { CoverArt } from '../components/CoverArt';
import { usePlayer, type QueueTrack } from '../components/PlayerBar';
import { PlaylistListItem } from '../components/PlaylistListItem';
import { Skeleton, SkeletonDetailHeader, SkeletonTrackRows } from '../components/Skeleton';
import { useToast } from '../components/ToastProvider';
import { useScrollLock } from '../hooks/useScrollLock';
import { ApiError, apiClient } from '../lib/apiClient';
import { formatDate, formatDuration, formatTotalLength } from '../lib/format';
import type { Profile, StatsRange, TrackSummary } from '../types/api';

/**
 * Someone's profile (A167-A170): picture, bio and pins, what they listen to most over a range, their playlists, and
 * their liked and disliked songs, which everyone sees (A168). Your own has Edit.
 */

const RANGES: { id: StatsRange; label: string }[] = [
  { id: 'week', label: 'Week' },
  { id: 'month', label: 'Month' },
  { id: 'year', label: 'Year' },
  { id: 'all', label: 'All time' },
];
const MAX_BIO_LENGTH = 300;
/** "Show all" loads up to this many liked or disliked songs. */
const FULL_LIST_LIMIT = 200;

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

function Section({ title, count, children }: { title: string; count?: number; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="flex items-baseline gap-2 text-sm font-semibold text-white">
        {title}
        {count !== undefined && <span className="font-mono text-xs font-normal tabular-nums text-blue-400">{count}</span>}
      </h2>
      {children}
    </section>
  );
}

/** Songs as rows; a click plays the list from there. `rank` numbers them as a top list. */
function SongRows({ tracks, rank, detail }: { tracks: TrackSummary[]; rank?: boolean; detail?: (i: number) => string }) {
  const { playQueue } = usePlayer();
  const queue = toQueue(tracks);
  return (
    <ul className="card divide-y divide-blue-800/60 overflow-hidden">
      {tracks.map((t, i) => (
        <li key={t.id}>
          <button
            type="button"
            onClick={() => playQueue(queue, i)}
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
  );
}

/** Liked or disliked songs: the first dozen, then all of them on request. */
function SongListSection({
  title,
  userId,
  kind,
  preview,
  total,
  empty,
}: {
  title: string;
  userId: number;
  kind: 'liked' | 'disliked';
  preview: TrackSummary[];
  total: number;
  empty: string;
}) {
  const [showAll, setShowAll] = useState(false);
  const full = useQuery({
    queryKey: ['profile', userId, kind],
    queryFn: () => apiClient.get<{ tracks: TrackSummary[] }>(`/users/${userId}/${kind}?limit=${FULL_LIST_LIMIT}`),
    enabled: showAll,
  });
  const tracks = showAll && full.data ? full.data.tracks : preview;
  return (
    <Section title={title} count={total}>
      {total === 0 ? (
        <p className="text-sm text-blue-300">{empty}</p>
      ) : (
        <>
          <SongRows tracks={tracks} />
          {!showAll && total > preview.length && (
            <button type="button" onClick={() => setShowAll(true)} className="btn-secondary btn-sm self-start">
              Show all {total}
            </button>
          )}
          {showAll && full.isLoading && <p className="text-xs text-blue-300">Loading the rest…</p>}
        </>
      )}
    </Section>
  );
}

export function ProfilePage() {
  const { id } = useParams<{ id: string }>();
  const userId = Number(id);
  const [range, setRange] = useState<StatsRange>('month');
  const [editing, setEditing] = useState(false);

  const { data, isLoading, isError, error, isPlaceholderData } = useQuery({
    queryKey: ['profile', userId, range],
    queryFn: () => apiClient.get<Profile>(`/users/${userId}/profile?range=${range}`),
    enabled: Number.isInteger(userId),
    placeholderData: (prev) => (prev && prev.id === userId ? prev : undefined),
  });

  if (isLoading) {
    return (
      <Skeleton label="Loading profile…">
        <SkeletonDetailHeader />
        <SkeletonTrackRows />
      </Skeleton>
    );
  }
  if (isError || !data) {
    return (
      <p className="text-sm text-red-300">
        {error instanceof ApiError && error.status === 404
          ? 'No profile here. Guests have none, and the account may have been deleted.'
          : 'Could not load this profile. Reload to try again.'}
      </p>
    );
  }

  const hours = formatTotalLength(Math.round(data.totals.msListened / 1000));
  const rangeLabel = RANGES.find((r) => r.id === range)!.label.toLowerCase();

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-start">
        <Avatar userId={data.id} name={data.name} avatarId={data.avatarId} size="lg" />
        <div className="min-w-0 flex-1">
          <span className="font-mono text-xs uppercase tracking-widest text-blue-400">Profile</span>
          <h1 className="font-display text-3xl font-extrabold text-white sm:text-4xl">{data.name}</h1>
          <p className="text-xs text-blue-300">
            <span className="font-mono">{data.username}</span>
            {data.isAdmin && ' · Admin'} · here since {formatDate(data.memberSince)}
          </p>
          {data.bio && <p className="mt-3 max-w-2xl whitespace-pre-line text-sm text-blue-100">{data.bio}</p>}
          {(data.favoriteTrack || data.favoriteArtist) && (
            <dl className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-sm">
              {data.favoriteTrack && (
                <div className="min-w-0">
                  <dt className="text-xs text-blue-400">Favourite song</dt>
                  <dd className="truncate text-white">
                    {data.favoriteTrack.title}
                    {data.favoriteTrack.artist && <span className="text-blue-300"> by {data.favoriteTrack.artist}</span>}
                  </dd>
                </div>
              )}
              {data.favoriteArtist && (
                <div className="min-w-0">
                  <dt className="text-xs text-blue-400">Favourite artist</dt>
                  <dd className="truncate">
                    <Link to={`/artists/${data.favoriteArtist.id}`} className="text-white underline-offset-2 hover:underline">
                      {data.favoriteArtist.name}
                    </Link>
                  </dd>
                </div>
              )}
            </dl>
          )}
        </div>
        {data.isSelf && (
          <button type="button" onClick={() => setEditing(true)} className="btn-secondary btn-md self-start">
            Edit profile
          </button>
        )}
      </header>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div role="group" aria-label="Time range" className="flex flex-wrap gap-1">
          {RANGES.map((r) => (
            <button
              key={r.id}
              type="button"
              aria-pressed={range === r.id}
              onClick={() => setRange(r.id)}
              className={`rounded-md border px-3 py-1.5 text-sm transition-colors ${
                range === r.id
                  ? 'border-orange-600 bg-blue-800 text-white'
                  : 'border-blue-700 text-blue-300 hover:border-blue-500 hover:text-white'
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>
        <p className={`text-sm text-blue-200 ${isPlaceholderData ? 'opacity-60' : ''}`}>
          <span className="font-semibold text-white">{hours}</span> listened ·{' '}
          <span className="font-semibold text-white">{data.totals.plays.toLocaleString()}</span> plays ·{' '}
          <span className="font-semibold text-white">{data.totals.tracks.toLocaleString()}</span> songs
        </p>
      </div>

      <div className={`grid gap-8 lg:grid-cols-2 ${isPlaceholderData ? 'opacity-60' : ''}`}>
        <Section title="Top songs">
          {data.topTracks.length === 0 ? (
            <p className="text-sm text-blue-300">Nothing played this {rangeLabel === 'all time' ? 'far' : rangeLabel}.</p>
          ) : (
            <SongRows
              tracks={data.topTracks.map((t) => t.track)}
              rank
              detail={(i) => `${data.topTracks[i].plays} ${data.topTracks[i].plays === 1 ? 'play' : 'plays'}`}
            />
          )}
        </Section>

        <div className="flex flex-col gap-8">
          <Section title="Top artists">
            {data.topArtists.length === 0 ? (
              <p className="text-sm text-blue-300">No artists yet for this range.</p>
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
                      <span className="shrink-0 font-mono text-xs tabular-nums text-blue-300">
                        {a.plays} {a.plays === 1 ? 'play' : 'plays'}
                      </span>
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

      <Section title={data.isSelf ? 'Your playlists' : 'Public playlists'} count={data.playlists.length}>
        {data.playlists.length === 0 ? (
          <p className="text-sm text-blue-300">
            {data.isSelf ? 'No playlists yet.' : `${data.name} hasn't made a playlist public.`}
          </p>
        ) : (
          <ul className="card divide-y divide-blue-800/60 overflow-hidden">
            {data.playlists.map((p) => (
              <li key={p.id}>
                <PlaylistListItem
                  id={p.id}
                  name={p.name}
                  trackCount={p.trackCount}
                  coverAlbumIds={p.coverAlbumIds}
                  isPublic={p.isPublic}
                />
              </li>
            ))}
          </ul>
        )}
      </Section>

      <div className="grid gap-8 lg:grid-cols-2">
        <SongListSection
          title="Liked songs"
          userId={data.id}
          kind="liked"
          preview={data.liked.tracks}
          total={data.liked.total}
          empty={data.isSelf ? 'Tap the heart on a song to keep it here.' : 'No liked songs yet.'}
        />
        <SongListSection
          title="Disliked songs"
          userId={data.id}
          kind="disliked"
          preview={data.disliked.tracks}
          total={data.disliked.total}
          empty="None."
        />
      </div>

      {editing && <EditProfileDialog profile={data} onClose={() => setEditing(false)} />}
    </div>
  );
}

/** Your picture, bio and pinned favourites (A169). Pins come from what you play and like. */
function EditProfileDialog({ profile, onClose }: { profile: Profile; onClose: () => void }) {
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const fileInput = useRef<HTMLInputElement>(null);
  const [bio, setBio] = useState(profile.bio ?? '');
  const [trackId, setTrackId] = useState<number | ''>(profile.favoriteTrack?.id ?? '');
  const [artistId, setArtistId] = useState<number | ''>(profile.favoriteArtist?.id ?? '');

  useScrollLock();
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Every song and artist this profile shows, so a pin is something you actually play or like.
  const songChoices = new Map<number, TrackSummary>();
  for (const t of [profile.favoriteTrack, ...profile.topTracks.map((x) => x.track), ...profile.liked.tracks]) {
    if (t) songChoices.set(t.id, t);
  }
  const artistChoices = new Map<number, string>();
  if (profile.favoriteArtist) artistChoices.set(profile.favoriteArtist.id, profile.favoriteArtist.name);
  for (const a of profile.topArtists) artistChoices.set(a.id, a.name);

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['profile', profile.id] });
  const fail = (err: unknown, fallback: string) =>
    showToast(err instanceof ApiError ? err.message : fallback, 'error');

  const pictureMutation = useMutation({
    mutationFn: (file: File | null) => {
      if (!file) return apiClient.delete('/me/avatar');
      const form = new FormData();
      form.append('file', file);
      return apiClient.upload('/me/avatar', form, 'PUT');
    },
    onSuccess: (_res, file) => {
      void refresh();
      void queryClient.invalidateQueries({ queryKey: ['people'] });
      showToast(file ? 'Picture updated' : 'Picture removed');
    },
    onError: (err) => fail(err, 'Could not change the picture'),
  });

  const saveMutation = useMutation({
    mutationFn: () =>
      apiClient.put('/me/profile', {
        bio: bio.trim() || null,
        favoriteTrackId: trackId === '' ? null : trackId,
        favoriteArtistId: artistId === '' ? null : artistId,
      }),
    onSuccess: () => {
      void refresh();
      void queryClient.invalidateQueries({ queryKey: ['people'] });
      showToast('Profile saved');
      onClose();
    },
    onError: (err) => fail(err, 'Could not save the profile'),
  });

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4" onClick={onClose}>
      <form
        role="dialog"
        aria-modal="true"
        aria-labelledby="edit-profile-heading"
        className="card flex max-h-[90vh] w-full max-w-lg flex-col gap-4 overflow-y-auto p-5"
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault();
          saveMutation.mutate();
        }}
      >
        <h2 id="edit-profile-heading" className="text-sm font-semibold text-white">
          Edit profile
        </h2>

        <div className="flex items-center gap-4">
          <Avatar userId={profile.id} name={profile.name} avatarId={profile.avatarId} size="md" />
          <div className="flex flex-wrap gap-2">
            <input
              ref={fileInput}
              type="file"
              accept="image/*"
              className="sr-only"
              aria-label="Choose a picture"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) pictureMutation.mutate(file);
                e.target.value = '';
              }}
            />
            <button
              type="button"
              onClick={() => fileInput.current?.click()}
              disabled={pictureMutation.isPending}
              className="btn-secondary btn-sm"
            >
              {pictureMutation.isPending ? 'Uploading…' : profile.avatarId ? 'Change picture' : 'Add a picture'}
            </button>
            {profile.avatarId && (
              <button
                type="button"
                onClick={() => pictureMutation.mutate(null)}
                disabled={pictureMutation.isPending}
                className="btn-ghost btn-sm"
              >
                Remove
              </button>
            )}
          </div>
        </div>
        <p className="-mt-2 text-xs text-blue-400">Cropped to a square from the middle. Up to 5 MB.</p>

        <label className="flex flex-col gap-1 text-sm text-blue-200">
          Bio
          <textarea
            value={bio}
            onChange={(e) => setBio(e.target.value.slice(0, MAX_BIO_LENGTH))}
            rows={3}
            className="input resize-y"
            placeholder="A line or two about you and your music"
          />
          <span className="self-end font-mono text-xs tabular-nums text-blue-400">
            {bio.length}/{MAX_BIO_LENGTH}
          </span>
        </label>

        <label className="flex flex-col gap-1 text-sm text-blue-200">
          Favourite song
          <select value={trackId} onChange={(e) => setTrackId(e.target.value === '' ? '' : Number(e.target.value))} className="input">
            <option value="">None</option>
            {[...songChoices.values()].map((t) => (
              <option key={t.id} value={t.id}>
                {t.title}
                {t.artist ? ` by ${t.artist}` : ''}
              </option>
            ))}
          </select>
          <span className="text-xs text-blue-400">From your top songs and liked songs.</span>
        </label>

        <label className="flex flex-col gap-1 text-sm text-blue-200">
          Favourite artist
          <select value={artistId} onChange={(e) => setArtistId(e.target.value === '' ? '' : Number(e.target.value))} className="input">
            <option value="">None</option>
            {[...artistChoices.entries()].map(([id, name]) => (
              <option key={id} value={id}>
                {name}
              </option>
            ))}
          </select>
          <span className="text-xs text-blue-400">From your top artists. Switch the range to see more.</span>
        </label>

        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="btn-secondary btn-sm">
            Cancel
          </button>
          <button type="submit" disabled={saveMutation.isPending} className="btn-primary btn-sm">
            {saveMutation.isPending ? 'Saving…' : 'Save'}
          </button>
        </div>
      </form>
    </div>,
    document.body,
  );
}
