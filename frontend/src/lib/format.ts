/** The one duration format. Floors seconds, like a player's elapsed time; rounding once printed `0:60` for 59.7 s. */
export function formatDuration(seconds: number | null): string {
  if (seconds == null) return '—';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

/** SQLite `datetime('now')` has no `T` or zone, which `Date.parse` reads as local; normalised to UTC first. */
export function formatDate(iso: string): string {
  const date = new Date(iso.includes('T') ? iso : iso.replace(' ', 'T') + 'Z');
  return Number.isNaN(date.getTime()) ? iso : date.toLocaleDateString();
}

/** One wording for a root's scan state (Options and the strip footer). `total` exists only after the initial walk. */
export function formatScanStatus(scanning: boolean, progress: { processed: number; total: number } | null): string {
  if (!scanning) return '';
  if (!progress) return 'Scanning…';
  // `total` is 0 only for a root with no audio files, mid-scan.
  const percent = progress.total > 0 ? Math.round((progress.processed / progress.total) * 100) : 0;
  return `Scanning… ${progress.processed}/${progress.total} (${percent}%)`;
}

/** Binary units, one decimal under 100: `512 B`, `3.4 MB`, `120 GB`. */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit++;
  }
  return `${value >= 100 ? value.toFixed(0) : value.toFixed(1)} ${units[unit]}`;
}

/** A library's total length: whole hours once there are any (`162 h`), minutes below that (`48 min`). */
export function formatTotalLength(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  if (hours > 0) return `${hours.toLocaleString()} h`;
  return `${Math.round(seconds / 60)} min`;
}
