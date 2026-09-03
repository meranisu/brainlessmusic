import { useQueryClient } from '@tanstack/react-query';
import { useRef, useState, type DragEvent } from 'react';
import { API_BASE_URL, getToken } from '../lib/apiClient';
import type { TrackSummary } from '../types/api';

const AUDIO_EXTENSIONS = new Set(['.flac', '.opus', '.mp3', '.m4a', '.ogg']);

type UploadStatus = 'queued' | 'uploading' | 'success' | 'error';

interface QueueItem {
  id: string;
  file: File;
  status: UploadStatus;
  progress: number;
  result?: TrackSummary;
  error?: string;
}

function extOf(filename: string): string {
  const i = filename.lastIndexOf('.');
  return i === -1 ? '' : filename.slice(i).toLowerCase();
}

// fetch() has no upload-progress event — XHR is the only way to show a
// per-file progress bar for a multipart upload in the browser.
function uploadWithProgress(file: File, onProgress: (pct: number) => void): Promise<TrackSummary> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${API_BASE_URL}/tracks/upload`);
    const token = getToken();
    if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
    };

    xhr.onload = () => {
      try {
        const payload = JSON.parse(xhr.responseText);
        if (xhr.status >= 200 && xhr.status < 300) {
          resolve(payload.track as TrackSummary);
        } else {
          reject(new Error(payload.error ?? `Upload failed (${xhr.status})`));
        }
      } catch {
        reject(new Error(`Upload failed (${xhr.status})`));
      }
    };
    xhr.onerror = () => reject(new Error('Network error during upload'));

    const formData = new FormData();
    formData.append('file', file);
    xhr.send(formData);
  });
}

const MAX_CONCURRENT = 3;

export function UploadPage() {
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();
  const inFlight = useRef(0);

  function addFiles(files: FileList | File[]) {
    const items: QueueItem[] = Array.from(files)
      .filter((f) => AUDIO_EXTENSIONS.has(extOf(f.name)))
      .map((f) => ({ id: crypto.randomUUID(), file: f, status: 'queued', progress: 0 }));
    setQueue((prev) => [...prev, ...items]);
    items.forEach(runUpload);
  }

  function updateItem(id: string, patch: Partial<QueueItem>) {
    setQueue((prev) => prev.map((it) => (it.id === id ? { ...it, ...patch } : it)));
  }

  async function runUpload(item: QueueItem) {
    while (inFlight.current >= MAX_CONCURRENT) {
      await new Promise((r) => setTimeout(r, 200));
    }
    inFlight.current++;
    updateItem(item.id, { status: 'uploading' });
    try {
      const result = await uploadWithProgress(item.file, (progress) => updateItem(item.id, { progress }));
      updateItem(item.id, { status: 'success', progress: 100, result });
      queryClient.invalidateQueries({ queryKey: ['tracks'] });
    } catch (err) {
      updateItem(item.id, { status: 'error', error: err instanceof Error ? err.message : 'Upload failed' });
    } finally {
      inFlight.current--;
    }
  }

  function retry(item: QueueItem) {
    updateItem(item.id, { status: 'queued', progress: 0, error: undefined });
    runUpload(item);
  }

  function handleDrop(e: DragEvent) {
    e.preventDefault();
    if (e.dataTransfer.files.length) addFiles(e.dataTransfer.files);
  }

  const succeeded = queue.filter((q) => q.status === 'success').length;
  const failed = queue.filter((q) => q.status === 'error').length;

  return (
    <div>
      <h1 className="mb-4 text-lg font-semibold text-neutral-100">Upload</h1>

      <div
        onDragOver={(e) => e.preventDefault()}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
        className="flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-neutral-700 bg-neutral-900 px-6 py-12 text-center hover:border-neutral-500"
      >
        <p className="text-sm text-neutral-300">Drop audio files here, or click to browse</p>
        <p className="mt-1 text-xs text-neutral-600">.flac .opus .mp3 .m4a .ogg</p>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept={[...AUDIO_EXTENSIONS].join(',')}
          className="hidden"
          onChange={(e) => e.target.files && addFiles(e.target.files)}
        />
      </div>

      {queue.length > 0 && (
        <>
          <p className="mb-2 mt-6 text-sm text-neutral-500">
            {succeeded} uploaded{failed > 0 ? `, ${failed} failed` : ''} of {queue.length}
          </p>
          <div className="divide-y divide-neutral-900 rounded-lg border border-neutral-800">
            {queue.map((item) => (
              <div key={item.id} className="flex items-center gap-3 px-4 py-3">
                <span className="w-40 shrink-0 truncate text-sm text-neutral-300">{item.file.name}</span>
                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-neutral-800">
                  <div
                    className={`h-full rounded-full transition-all ${
                      item.status === 'error' ? 'bg-red-500' : 'bg-neutral-100'
                    }`}
                    style={{ width: `${item.progress}%` }}
                  />
                </div>
                {item.status === 'success' && (
                  <span className="shrink-0 text-xs text-neutral-500">
                    {item.result?.title} — {item.result?.artist}
                  </span>
                )}
                {item.status === 'error' && (
                  <>
                    <span className="shrink-0 text-xs text-red-400">{item.error}</span>
                    <button
                      onClick={() => retry(item)}
                      className="shrink-0 rounded border border-neutral-700 px-2 py-0.5 text-xs text-neutral-300"
                    >
                      Retry
                    </button>
                  </>
                )}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
