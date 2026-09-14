/**
 * One definition of how a duration is written.
 *
 * There were three, and they disagreed. Two rounded the seconds and one floored
 * them, so the same track could read `3:59` on one screen and `4:00` on
 * another — and rounding was not merely inconsistent, it was wrong: a 59.7
 * second track gave `Math.floor(59.7 / 60)` = 0 minutes and
 * `Math.round(59.7)` = 60 seconds, printing **`0:60`**. Any duration within
 * half a second of a minute boundary hit it.
 *
 * Flooring is also the convention a player uses for elapsed time: a track is
 * "3:59" until it is actually 4:00.
 */
export function formatDuration(seconds: number | null): string {
  if (seconds == null) return '—';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}
