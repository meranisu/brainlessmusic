import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { buildStreamUrl } from '../lib/apiClient';
import { useToast } from './ToastProvider';

interface NowPlaying {
  trackId: number;
  label: string;
}

interface PreviewPlayerContextValue {
  nowPlaying: NowPlaying | null;
  isPlaying: boolean;
  isLoading: boolean;
  play: (trackId: number, label: string) => void;
  pause: () => void;
  stop: () => void;
}

const PreviewPlayerContext = createContext<PreviewPlayerContextValue | undefined>(undefined);

export function PreviewPlayerProvider({ children }: { children: ReactNode }) {
  const [nowPlaying, setNowPlaying] = useState<NowPlaying | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const { showToast } = useToast();

  useEffect(() => {
    const audio = new Audio();
    audioRef.current = audio;
    audio.addEventListener('ended', () => setIsPlaying(false));
    return () => {
      audio.pause();
    };
  }, []);

  async function play(trackId: number, label: string) {
    const audio = audioRef.current;
    if (!audio) return;

    // Already loaded — just resume rather than re-fetching.
    if (nowPlaying?.trackId === trackId && audio.src) {
      audio.play();
      setIsPlaying(true);
      return;
    }

    setIsLoading(true);
    setNowPlaying({ trackId, label });
    try {
      // Points `<audio>` straight at the stream so the browser fetches it
      // progressively and can seek, instead of waiting on a whole-file
      // download before the first note.
      audio.src = await buildStreamUrl(trackId);
      await audio.play();
      setIsPlaying(true);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to load track', 'error');
      setNowPlaying(null);
    } finally {
      setIsLoading(false);
    }
  }

  function pause() {
    audioRef.current?.pause();
    setIsPlaying(false);
  }

  function stop() {
    const audio = audioRef.current;
    if (audio) {
      audio.pause();
      audio.removeAttribute('src');
      audio.load(); // drop the in-flight range request rather than buffering on
    }
    setNowPlaying(null);
    setIsPlaying(false);
  }

  return (
    <PreviewPlayerContext.Provider value={{ nowPlaying, isPlaying, isLoading, play, pause, stop }}>
      {children}
      {nowPlaying && (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-blue-800 bg-blue-900">
          <div className="page-shell flex items-center gap-3 px-6 py-3">
            <button
              onClick={() => (isPlaying ? pause() : play(nowPlaying.trackId, nowPlaying.label))}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-orange-600 text-blue-950 transition-colors hover:bg-orange-500"
              aria-label={isPlaying ? 'Pause' : 'Play'}
            >
              {isLoading ? '…' : isPlaying ? '❚❚' : '▶'}
            </button>
            <span className="truncate text-sm text-blue-100">{nowPlaying.label}</span>
            <button
              onClick={stop}
              className="ml-auto shrink-0 text-sm text-blue-300 hover:text-blue-100"
              aria-label="Stop preview"
            >
              ✕
            </button>
          </div>
        </div>
      )}
    </PreviewPlayerContext.Provider>
  );
}

export function usePreviewPlayer(): PreviewPlayerContextValue {
  const ctx = useContext(PreviewPlayerContext);
  if (!ctx) throw new Error('usePreviewPlayer must be used within PreviewPlayerProvider');
  return ctx;
}
