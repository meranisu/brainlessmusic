import { useQueryClient } from '@tanstack/react-query';
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { API_BASE_URL, authHeaders, getToken, refuseSession } from '../lib/apiClient';
import type { TrackSummary } from '../types/api';

// Must match AUDIO_EXTENSIONS in backend/src/services/trackTags.ts; a type missing here can't be picked at all.
export const AUDIO_EXTENSIONS = new Set(['.flac', '.opus', '.mp3', '.m4a', '.ogg', '.wav', '.aac']);

const MAX_CONCURRENT = 3;

export type UploadStatus = 'queued' | 'uploading' | 'success' | 'error';

export interface UploadItem {
  id: string;
  file: File;
  status: UploadStatus;
  progress: number;
  result?: TrackSummary;
  error?: string;
  /** The HTTP status of a failed upload; undefined when no response came back at all (network). */
  httpStatus?: number;
  /** When it failed, epoch ms. */
  failedAt?: number;
}

/** Keeps the HTTP status with the message, for the failed-uploads details. */
class UploadError extends Error {
  readonly status: number | undefined;
  constructor(message: string, status?: number) {
    super(message);
    this.status = status;
  }
}

interface UploadContextValue {
  queue: UploadItem[];
  /** Names of the files the last drop or pick left out, for the Upload page to say so. */
  skipped: string[];
  addFiles: (files: FileList | File[]) => void;
  retry: (item: UploadItem) => void;
  clearFinished: () => void;
}

const UploadContext = createContext<UploadContextValue | undefined>(undefined);

function extOf(filename: string): string {
  const i = filename.lastIndexOf('.');
  return i === -1 ? '' : filename.slice(i).toLowerCase();
}

// XHR, because fetch() has no upload-progress event.
function uploadWithProgress(file: File, onProgress: (pct: number) => void): Promise<TrackSummary> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${API_BASE_URL}/tracks/upload`);
    const token = getToken();
    for (const [name, value] of Object.entries(authHeaders(token))) xhr.setRequestHeader(name, value);

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
    };

    xhr.onload = () => {
      if (xhr.status === 401) refuseSession(token);
      try {
        const payload = JSON.parse(xhr.responseText);
        if (xhr.status >= 200 && xhr.status < 300) {
          resolve(payload.track as TrackSummary);
        } else {
          reject(new UploadError(payload?.error ?? `Upload failed (${xhr.status})`, xhr.status));
        }
      } catch {
        // Not JSON: a proxy in front answered instead of the server. Cloudflare refuses bodies over 100 MB this way.
        reject(
          new UploadError(
            xhr.status === 413 ? 'File is too large for the server to accept' : `Upload failed (${xhr.status})`,
            xhr.status,
          ),
        );
      }
    };
    xhr.onerror = () => reject(new UploadError('Network error during upload'));
    xhr.onabort = () => reject(new UploadError('Upload cancelled'));
    xhr.ontimeout = () => reject(new UploadError('Upload timed out'));

    const formData = new FormData();
    formData.append('file', file);
    xhr.send(formData);
  });
}

/**
 * Holds the upload queue above the routes, so uploads keep going while the admin uses other pages and the Control
 * Center can show them. Closing or reloading the tab still ends them; the browser is asked to warn first.
 */
export function UploadProvider({ children }: { children: ReactNode }) {
  const [queue, setQueue] = useState<UploadItem[]>([]);
  const [skipped, setSkipped] = useState<string[]>([]);
  const queryClient = useQueryClient();
  const inFlight = useRef(0);

  const updateItem = useCallback((id: string, patch: Partial<UploadItem>) => {
    setQueue((prev) => prev.map((it) => (it.id === id ? { ...it, ...patch } : it)));
  }, []);

  const runUpload = useCallback(
    async (item: UploadItem) => {
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
        updateItem(item.id, {
          status: 'error',
          error: err instanceof Error ? err.message : 'Upload failed',
          httpStatus: err instanceof UploadError ? err.status : undefined,
          failedAt: Date.now(),
        });
      } finally {
        inFlight.current--;
      }
    },
    [queryClient, updateItem],
  );

  const addFiles = useCallback(
    (files: FileList | File[]) => {
      const all = Array.from(files);
      setSkipped(all.filter((f) => !AUDIO_EXTENSIONS.has(extOf(f.name))).map((f) => f.name));
      const items: UploadItem[] = all
        .filter((f) => AUDIO_EXTENSIONS.has(extOf(f.name)))
        .map((f) => ({ id: crypto.randomUUID(), file: f, status: 'queued', progress: 0 }));
      setQueue((prev) => [...prev, ...items]);
      items.forEach(runUpload);
    },
    [runUpload],
  );

  const retry = useCallback(
    (item: UploadItem) => {
      updateItem(item.id, { status: 'queued', progress: 0, error: undefined, httpStatus: undefined, failedAt: undefined });
      runUpload(item);
    },
    [runUpload, updateItem],
  );

  const clearFinished = useCallback(() => {
    setQueue((prev) => prev.filter((it) => it.status === 'queued' || it.status === 'uploading'));
    setSkipped([]);
  }, []);

  const busy = queue.some((it) => it.status === 'queued' || it.status === 'uploading');
  useEffect(() => {
    if (!busy) return;
    // Browsers show their own wording; this only makes them ask.
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [busy]);

  return (
    <UploadContext.Provider value={{ queue, skipped, addFiles, retry, clearFinished }}>{children}</UploadContext.Provider>
  );
}

export function useUploads(): UploadContextValue {
  const ctx = useContext(UploadContext);
  if (!ctx) throw new Error('useUploads must be used within UploadProvider');
  return ctx;
}
