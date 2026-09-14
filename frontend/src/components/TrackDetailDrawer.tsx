import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { formatDuration } from '../lib/format';
import { useEffect, useState } from 'react';
import { useAuth } from '../auth/AuthContext';
import { useScrollLock } from '../hooks/useScrollLock';
import { apiClient, ApiError } from '../lib/apiClient';
import type { TrackDetail, TrackPatchInput } from '../types/api';
import { CoverArt } from './CoverArt';
import { usePlayer } from './PlayerBar';
import { useToast } from './ToastProvider';
import { PlayIcon } from './icons';

interface TrackDetailDrawerProps {
  trackId: number;
  initialTab: 'tags' | 'diagnostics';
  onClose: () => void;
}

function formatBytes(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function TrackDetailDrawer({ trackId, initialTab, onClose }: TrackDetailDrawerProps) {
  useScrollLock();

  const [tab, setTab] = useState(initialTab);
  const { user } = useAuth();
  const { playTrack } = usePlayer();
  const { showToast } = useToast();
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['track', trackId],
    queryFn: () => apiClient.get<TrackDetail>(`/tracks/${trackId}`),
  });

  const [title, setTitle] = useState('');
  const [artist, setArtist] = useState('');
  const [album, setAlbum] = useState('');
  const [trackNumber, setTrackNumber] = useState('');

  useEffect(() => {
    if (!data) return;
    setTitle(data.title);
    setArtist(data.artist ?? '');
    setAlbum(data.album ?? '');
    setTrackNumber(data.trackNumber != null ? String(data.trackNumber) : '');
  }, [data]);

  const saveMutation = useMutation({
    mutationFn: (patch: TrackPatchInput) => apiClient.patch<TrackDetail>(`/tracks/${trackId}`, patch),
    onSuccess: (updated) => {
      queryClient.setQueryData(['track', trackId], updated);
      queryClient.invalidateQueries({ queryKey: ['tracks'] });
      showToast('Saved');
    },
    onError: (err) => showToast(err instanceof ApiError ? err.message : 'Save failed', 'error'),
  });

  function handleSave() {
    saveMutation.mutate({
      title,
      artist: artist.trim() ? artist : null,
      album: album.trim() ? album : null,
      trackNumber: trackNumber.trim() ? Number(trackNumber) : null,
    });
  }

  const isAdmin = Boolean(user?.isAdmin);

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/60" onClick={onClose}>
      <div
        className="flex h-full w-full max-w-md flex-col border-l border-blue-800 bg-blue-900"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 border-b border-blue-800 px-4 py-3.5">
          {data && (
            <button
              onClick={() => playTrack(data)}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-orange-600 text-white transition-colors hover:bg-orange-500"
              aria-label="Preview"
            >
              <PlayIcon />
            </button>
          )}
          <CoverArt kind="tracks" id={trackId} size="full" className="h-9 w-9" />
          <h2 className="truncate text-sm font-medium text-white">{data?.title ?? 'Track'}</h2>
          <button onClick={onClose} className="btn-ghost btn-sm ml-auto px-2!" aria-label="Close">
            ✕
          </button>
        </div>

        <div className="flex border-b border-blue-800 px-2">
          <button
            onClick={() => setTab('tags')}
            className={`px-3 py-2.5 text-sm font-medium transition-colors ${tab === 'tags' ? 'border-b-2 border-orange-600 text-white' : 'text-blue-300 hover:text-blue-100'}`}
          >
            Tags
          </button>
          <button
            onClick={() => setTab('diagnostics')}
            className={`px-3 py-2.5 text-sm font-medium transition-colors ${tab === 'diagnostics' ? 'border-b-2 border-orange-600 text-white' : 'text-blue-300 hover:text-blue-100'}`}
          >
            Diagnostics
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-4">
          {isLoading && <p className="text-sm text-blue-300">Loading…</p>}

          {data && tab === 'tags' && (
            <div className="space-y-3">
              <Field label="Title">
                <input value={title} onChange={(e) => setTitle(e.target.value)} disabled={!isAdmin} className="input" />
              </Field>
              <Field label="Artist">
                <input value={artist} onChange={(e) => setArtist(e.target.value)} disabled={!isAdmin} className="input" />
              </Field>
              <Field label="Album">
                <input value={album} onChange={(e) => setAlbum(e.target.value)} disabled={!isAdmin} className="input" />
              </Field>
              <Field label="Track number">
                <input
                  value={trackNumber}
                  onChange={(e) => setTrackNumber(e.target.value)}
                  disabled={!isAdmin}
                  inputMode="numeric"
                  className="input"
                />
              </Field>

              {isAdmin ? (
                <button onClick={handleSave} disabled={saveMutation.isPending} className="btn-primary btn-md w-full">
                  {saveMutation.isPending ? 'Saving…' : 'Save'}
                </button>
              ) : (
                <p className="text-xs text-blue-400">Sign in as an admin to edit tags.</p>
              )}
            </div>
          )}

          {data && tab === 'diagnostics' && (
            <div className="space-y-2 text-sm">
              <DiagnosticRow label="Format" value={data.format ?? '—'} />
              <DiagnosticRow label="Bitrate" value={data.bitrate ? `${Math.round(data.bitrate / 1000)} kbps` : '—'} />
              <DiagnosticRow label="Sample rate" value={data.sampleRate ? `${data.sampleRate} Hz` : '—'} />
              <DiagnosticRow label="Duration" value={formatDuration(data.duration)} />
              <DiagnosticRow label="File size" value={formatBytes(data.fileSize)} />
              <DiagnosticRow label="Play count" value={String(data.playCount)} />
              <DiagnosticRow label="Date added" value={new Date(data.dateAdded).toLocaleString()} />
              <DiagnosticRow
                label="Last played"
                value={data.lastPlayedAt ? new Date(data.lastPlayedAt).toLocaleString() : 'Never'}
              />
              <DiagnosticRow
                label="Last stream error"
                value={data.lastStreamError ?? 'None'}
                valueClassName={data.lastStreamError ? 'text-red-400' : undefined}
              />
              <DiagnosticRow
                label="File on disk"
                value={
                  data.missingSince
                    ? `Missing since ${new Date(data.missingSince).toLocaleString()}`
                    : 'Present'
                }
                valueClassName={data.missingSince ? 'text-red-400' : undefined}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs text-blue-300">{label}</span>
      {children}
    </label>
  );
}

function DiagnosticRow({
  label,
  value,
  valueClassName,
}: {
  label: string;
  value: string;
  valueClassName?: string;
}) {
  return (
    <div className="flex justify-between gap-4 border-b border-blue-900 py-1.5">
      <span className="text-blue-300">{label}</span>
      <span className={`text-right text-blue-100 ${valueClassName ?? ''}`}>{value}</span>
    </div>
  );
}
