/** SQLite `datetime('now')` has no `T` or zone, which `Date.parse` reads as local; normalised to UTC first. */
export function parseSqliteDate(iso: string): Date {
  return new Date(iso.includes('T') ? iso : iso.replace(' ', 'T') + 'Z');
}

/** The one duration format. Floors seconds, like a player's elapsed time; rounding once printed `0:60` for 59.7 s. */
export function formatDuration(seconds: number | null): string {
  if (seconds == null) return '—';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

export function formatDate(iso: string): string {
  const date = parseSqliteDate(iso);
  return Number.isNaN(date.getTime()) ? iso : date.toLocaleDateString();
}

/** Like `formatDuration`, but a negative or non-finite value reads `0:00` (a player's elapsed time can be NaN). */
export function formatClock(seconds: number): string {
  return !Number.isFinite(seconds) || seconds < 0 ? '0:00' : formatDuration(seconds);
}

/** Date and time, for logs where the hour matters. SQLite's `YYYY-MM-DD HH:MM:SS` is UTC. */
export function formatDateTime(iso: string): string {
  const date = parseSqliteDate(iso);
  return Number.isNaN(date.getTime())
    ? iso
    : date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

/** How long ago, roughly: "just now", "5 min ago", "3 h ago", "2 days ago", then the date. `now` is passed in, so a render stays pure. */
export function formatSince(iso: string, now: number): string {
  const at = parseSqliteDate(iso).getTime();
  if (Number.isNaN(at)) return iso;
  const minutes = Math.floor((now - at) / 60_000);
  if (minutes < 2) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.floor(hours / 24);
  if (days < 14) return days === 1 ? 'yesterday' : `${days} days ago`;
  return new Date(at).toLocaleDateString();
}

/**
 * A short device description from a user agent, for the guest sign-in log: "Firefox on Windows", "Android app". Rough
 * on purpose; the raw string is kept as a tooltip.
 */
export function describeDevice(userAgent: string | null): string {
  if (!userAgent) return 'Unknown device';
  if (/okhttp/i.test(userAgent)) return 'Android app';

  const os = /Android/i.test(userAgent)
    ? 'Android'
    : /iPhone|iPad|iPod/i.test(userAgent)
      ? 'iOS'
      : /Windows/i.test(userAgent)
        ? 'Windows'
        : /Mac OS X|Macintosh/i.test(userAgent)
          ? 'macOS'
          : /Linux|X11/i.test(userAgent)
            ? 'Linux'
            : null;
  const browser = /Edg\//.test(userAgent)
    ? 'Edge'
    : /Firefox\//.test(userAgent)
      ? 'Firefox'
      : /Chrome\//.test(userAgent)
        ? 'Chrome'
        : /Safari\//.test(userAgent)
          ? 'Safari'
          : null;

  if (browser && os) return `${browser} on ${os}`;
  return browser ?? os ?? userAgent.slice(0, 40);
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
  // Judged on the rounded figure, so 99.96 KB shows "100 KB" (not "100.0") and 1023.9 KB moves up to "1.0 MB".
  const shown = (v: number) => (v >= 99.95 ? v.toFixed(0) : v.toFixed(1));
  let value = bytes / 1024;
  let unit = 0;
  while (Number(shown(value)) >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit++;
  }
  return `${shown(value)} ${units[unit]}`;
}

/** A library's total length: whole hours once there are any (`162 h`), minutes below that (`48 min`). */
export function formatTotalLength(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  if (hours > 0) return `${hours.toLocaleString()} h`;
  // A library under half a minute long still has something in it.
  return `${seconds > 0 ? Math.max(1, Math.round(seconds / 60)) : 0} min`;
}
