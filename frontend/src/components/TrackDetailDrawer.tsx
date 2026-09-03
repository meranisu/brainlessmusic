import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useAuth } from '../auth/AuthContext';
import { apiClient, ApiError } from '../lib/apiClient';
import type { TrackDetail, TrackPatchInput } from '../types/api';
import { usePreviewPlayer } from './PreviewPlayerBar';
import { useToast } from './ToastProvider';

interface TrackDetailDrawerProps {
  trackId: number;
  initialTab: 'tags' | 'diagnostics';
  onClose: () => void;
}

function formatDuration(seconds: number | null): string {
  if (seconds == null) return '—';
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function formatBytes(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function TrackDetailDrawer({ trackId, initialTab, onClose }: TrackDetailDrawerProps) {
  const [tab, setTab] = useState(initialTab);
  const { user } = useAuth();
  const { play } = usePreviewPlayer();
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
    <div className="fixed inset-0 z-50 flex justify-end bg-black/50" onClick={onClose}>
      <div
        className="flex h-full w-full max-w-md flex-col bg-neutral-900 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 border-b border-neutral-800 px-4 py-3">
          {data && (
            <button
              onClick={() => play(trackId, `${data.title} — ${data.artist ?? 'Unknown Artist'}`)}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-neutral-100 text-neutral-900"
              aria-label="Preview"
            >
              ▶
            </button>
          )}
          <h2 className="truncate text-sm font-medium text-neutral-100">{data?.title ?? 'Track'}</h2>
          <button onClick={onClose} className="ml-auto text-neutral-500 hover:text-neutral-300" aria-label="Close">
            ✕
          </button>
        </div>

        <div className="flex border-b border-neutral-800">
          <button
            onClick={() => setTab('tags')}
            className={`px-4 py-2 text-sm ${tab === 'tags' ? 'border-b-2 border-neutral-100 text-neutral-100' : 'text-neutral-500'}`}
          >
            Tags
          </button>
          <button
            onClick={() => setTab('diagnostics')}
            className={`px-4 py-2 text-sm ${tab === 'diagnostics' ? 'border-b-2 border-neutral-100 text-neutral-100' : 'text-neutral-500'}`}
          >
            Diagnostics
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-4">
          {isLoading && <p className="text-sm text-neutral-500">Loading…</p>}

          {data && tab === 'tags' && (
            <div className="space-y-3">
              <Field label="Title">
                <input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  disabled={!isAdmin}
                  className="w-full rounded-md border border-neutral-700 bg-neutral-950 px-3 py-1.5 text-sm text-neutral-100 outline-none focus:border-neutral-500 disabled:opacity-60"
                />
              </Field>
              <Field label="Artist">
                <input
                  value={artist}
                  onChange={(e) => setArtist(e.target.value)}
                  disabled={!isAdmin}
                  className="w-full rounded-md border border-neutral-700 bg-neutral-950 px-3 py-1.5 text-sm text-neutral-100 outline-none focus:border-neutral-500 disabled:opacity-60"
                />
              </Field>
              <Field label="Album">
                <input
                  value={album}
                  onChange={(e) => setAlbum(e.target.value)}
                  disabled={!isAdmin}
                  className="w-full rounded-md border border-neutral-700 bg-neutral-950 px-3 py-1.5 text-sm text-neutral-100 outline-none focus:border-neutral-500 disabled:opacity-60"
                />
              </Field>
              <Field label="Track number">
                <input
                  value={trackNumber}
                  onChange={(e) => setTrackNumber(e.target.value)}
                  disabled={!isAdmin}
                  inputMode="numeric"
                  className="w-full rounded-md border border-neutral-700 bg-neutral-950 px-3 py-1.5 text-sm text-neutral-100 outline-none focus:border-neutral-500 disabled:opacity-60"
                />
              </Field>

              {isAdmin ? (
                <button
                  onClick={handleSave}
                  disabled={saveMutation.isPending}
                  className="w-full rounded-md bg-neutral-100 px-3 py-2 text-sm font-medium text-neutral-900 disabled:opacity-50"
                >
                  {saveMutation.isPending ? 'Saving…' : 'Save'}
                </button>
              ) : (
                <p className="text-xs text-neutral-600">Sign in as an admin to edit tags.</p>
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
      <span className="mb-1 block text-xs text-neutral-500">{label}</span>
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
    <div className="flex justify-between gap-4 border-b border-neutral-900 py-1.5">
      <span className="text-neutral-500">{label}</span>
      <span className={`text-right text-neutral-200 ${valueClassName ?? ''}`}>{value}</span>
    </div>
  );
}
