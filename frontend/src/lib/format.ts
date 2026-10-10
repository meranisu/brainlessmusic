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
