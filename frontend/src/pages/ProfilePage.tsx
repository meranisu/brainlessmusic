import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { Avatar } from '../components/Avatar';
import { AvatarCropper, pickProblem } from '../components/AvatarCropper';
import { PlaylistListItem } from '../components/PlaylistListItem';
import { Skeleton, SkeletonDetailHeader, SkeletonTrackRows } from '../components/Skeleton';
import { useToast } from '../components/ToastProvider';
import { useScrollLock } from '../hooks/useScrollLock';
import { ApiError, apiClient } from '../lib/apiClient';
import { formatDate, formatTotalLength } from '../lib/format';
import type { Profile, StatsRange, TrackSummary } from '../types/api';
import { ListeningRadar } from '../components/ListeningRadar';
import { RANGES, RangePicker, Section, SongRows } from '../components/ListeningParts';
import { radarReadings } from '../lib/listeningRadar';
import { FriendsPanel } from './FriendsPage';
import { StatsPanel } from './StatsPage';
import { usePageTitle } from '../hooks/usePageTitle';

/**
 * Someone's profile (A167-A170): picture, bio and pins, what they listen to most over a range, their playlists, and
 * their liked and disliked songs, which everyone sees (A168). Your own has Edit, and Stats and Friends as tabs beside
 * it (owner, 2026-10-21), kept in `?tab=` so a reload or a link lands on the same one.
 */

const MAX_BIO_LENGTH = 300;
/** "Show all" loads up to this many liked or disliked songs. */
const FULL_LIST_LIMIT = 200;

const PROFILE_TABS = [
  { id: 'profile', label: 'Profile' },
  { id: 'stats', label: 'Stats' },
  { id: 'friends', label: 'Friends' },
] as const;
type ProfileTab = (typeof PROFILE_TABS)[number]['id'];

/** Your own profile's tabs. Arrow keys move between them, as in the changelog's. */
function ProfileTabs({ tab, onChoose }: { tab: ProfileTab; onChoose: (tab: ProfileTab) => void }) {
  const refs = useRef<Partial<Record<ProfileTab, HTMLButtonElement | null>>>({});

  function onKey(event: ReactKeyboardEvent) {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    const i = PROFILE_TABS.findIndex((t) => t.id === tab);
    const step = event.key === 'ArrowRight' ? 1 : -1;
    const next = PROFILE_TABS[(i + step + PROFILE_TABS.length) % PROFILE_TABS.length].id;
    onChoose(next);
    refs.current[next]?.focus();
  }

  return (
    <div role="tablist" aria-label="Your profile" className="-mt-2 flex gap-1 border-b border-blue-800" onKeyDown={onKey}>
      {PROFILE_TABS.map((t) => (
        <button
          key={t.id}
          ref={(el) => {
            refs.current[t.id] = el;
          }}
          type="button"
          role="tab"
          id={`profile-tab-${t.id}`}
          aria-selected={tab === t.id}
          aria-controls="profile-panel"
          tabIndex={tab === t.id ? 0 : -1}
          onClick={() => onChoose(t.id)}
          className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium transition-colors ${
            tab === t.id ? 'border-orange-600 text-white' : 'border-transparent text-blue-300 hover:border-blue-500 hover:text-white'
          }`}
        >
          {t.label}
        </button>
      ))}
    </div>
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
  const [params, setParams] = useSearchParams();

  const { data, isLoading, isError, error, isPlaceholderData } = useQuery({
    queryKey: ['profile', userId, range],
    queryFn: () => apiClient.get<Profile>(`/users/${userId}/profile?range=${range}`),
    enabled: Number.isInteger(userId),
    placeholderData: (prev) => (prev && prev.id === userId ? prev : undefined),
  });
  usePageTitle(data?.name);

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

  const asked = params.get('tab');
  const tab: ProfileTab = data.isSelf && (asked === 'stats' || asked === 'friends') ? asked : 'profile';
  const chooseTab = (next: ProfileTab) => setParams(next === 'profile' ? {} : { tab: next }, { replace: true });

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
            {/* Only on your own (A174). */}
            {data.username && <span className="font-mono">{data.username} · </span>}
            {data.isAdmin && 'Admin · '}here since {formatDate(data.memberSince)}
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
          <div className="flex shrink-0 flex-wrap gap-2 self-start">
            <button type="button" onClick={() => setEditing(true)} className="btn-secondary btn-md">
              Edit profile
            </button>
          </div>
        )}
      </header>

      {data.isSelf && <ProfileTabs tab={tab} onChoose={chooseTab} />}

      {tab === 'stats' ? (
        <div role="tabpanel" id="profile-panel" aria-labelledby="profile-tab-stats">
          <StatsPanel />
        </div>
      ) : tab === 'friends' ? (
        <div role="tabpanel" id="profile-panel" aria-labelledby="profile-tab-friends">
          <FriendsPanel />
        </div>
      ) : (
        <div
          className="flex flex-col gap-8"
          {...(data.isSelf ? { role: 'tabpanel', id: 'profile-panel', 'aria-labelledby': 'profile-tab-profile' } : {})}
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <RangePicker value={range} onChange={setRange} />
            <p className={`text-sm text-blue-200 ${isPlaceholderData ? 'opacity-60' : ''}`}>
              <span className="font-semibold text-white">{hours}</span> listened ·{' '}
              <span className="font-semibold text-white">{data.totals.plays.toLocaleString()}</span> plays ·{' '}
              <span className="font-semibold text-white">{data.totals.tracks.toLocaleString()}</span> songs
            </p>
          </div>

          {/* What the account does over the range, as the Android app's Gear radar reads it (owner, 2026-10-13). */}
          <ListeningRadar
            readings={radarReadings(data, range)}
            title={`${data.isSelf ? 'Your' : `${data.name}'s`} ${range === 'all' ? 'listening so far' : rangeLabel}, read like a chart`}
            dimmed={isPlaceholderData}
          />

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
                      description={p.description}
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
        </div>
      )}

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
  // A picked picture waiting to be cropped; while it is, the dialog shows the cropper instead of the form.
  const [picked, setPicked] = useState<File | null>(null);

  useScrollLock();
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      if (picked) setPicked(null);
      else onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, picked]);

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

  const { refreshUser } = useAuth();
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
      // The header's picture button reads it from the signed-in user (A171).
      void refreshUser().catch(() => {});
      setPicked(null);
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
    <div className="motion-scrim fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4" onClick={onClose}>
      <form
        role="dialog"
        aria-modal="true"
        aria-labelledby="edit-profile-heading"
        className="motion-pop card flex max-h-[90vh] w-full max-w-lg flex-col gap-4 overflow-y-auto p-5"
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault();
          saveMutation.mutate();
        }}
      >
        <h2 id="edit-profile-heading" className="text-sm font-semibold text-white">
          {picked ? 'Crop your picture' : 'Edit profile'}
        </h2>

        {picked ? (
          <AvatarCropper
            file={picked}
            busy={pictureMutation.isPending}
            onCancel={() => setPicked(null)}
            onSave={(picture) => pictureMutation.mutate(new File([picture], 'avatar.jpg', { type: 'image/jpeg' }))}
          />
        ) : (
          <>
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
                    e.target.value = '';
                    if (!file) return;
                    const problem = pickProblem(file);
                    if (problem) showToast(problem, 'error');
                    else setPicked(file);
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
            <p className="-mt-2 text-xs text-blue-400">You can move and zoom it before it's saved. Up to 20 MB.</p>

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
          </>
        )}
      </form>
    </div>,
    document.body,
  );
}
