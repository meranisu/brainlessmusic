import { formatBytes } from '../lib/format';
import { useUploads, type UploadItem } from './UploadProvider';

/** What to do about a failure, where the cause is known. Otherwise the server's own message has to do. */
function hintFor(item: UploadItem): string | null {
  if (item.httpStatus === undefined) return 'The connection dropped before the server answered. Retry usually works.';
  if (item.httpStatus === 413) {
    return "Over 100 MB can't go through the public address (Cloudflare's limit). Upload it over Tailscale instead (A99).";
  }
  if (item.httpStatus === 401) return 'Your sign-in ran out. Sign in again, then Retry.';
  if (item.httpStatus >= 500) return 'The server hit an error. Retry, and check the server log if it keeps failing.';
  return null;
}

function extensionOf(name: string): string {
  const i = name.lastIndexOf('.');
  return i === -1 ? 'no extension' : name.slice(i + 1).toUpperCase();
}

/**
 * The upload queue, shared by the Upload page and the Control Center. Renders nothing while the queue is empty.
 * Failures get their own box below the progress list, with what's known about each (owner request, 2026-10-11).
 * `scrollable` caps each box at about six rows and scrolls inside, so a long queue doesn't push the rest of a page down.
 */
export function UploadQueueList({ scrollable = false }: { scrollable?: boolean }) {
  const { queue, retry, clearFinished } = useUploads();
  if (queue.length === 0) return null;

  const failed = queue.filter((q) => q.status === 'error');
  const others = queue.filter((q) => q.status !== 'error');
  const succeeded = others.filter((q) => q.status === 'success').length;
  const finished = succeeded + failed.length;
  // Focusable when it scrolls, so the arrow keys can scroll it too.
  const scrollBox = (label: string) =>
    scrollable
      ? { className: 'max-h-80 overflow-y-auto overscroll-contain', tabIndex: 0, role: 'region', 'aria-label': label }
      : { className: '' };

  const progressBox = scrollBox('Upload queue');
  const failedBox = scrollBox('Failed uploads');

  return (
    <>
      <div className="mb-2 flex items-center justify-between gap-2 text-sm">
        <span className="text-blue-100">
          {succeeded} uploaded{failed.length > 0 ? `, ${failed.length} failed` : ''} of {queue.length}
        </span>
        {finished > 0 && (
          <button onClick={clearFinished} className="btn-secondary btn-sm">
            Clear finished
          </button>
        )}
      </div>

      {others.length > 0 && (
        <div {...progressBox} className={`card divide-y divide-blue-800 ${progressBox.className}`}>
          {others.map((item) => (
            <div key={item.id} className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-4 py-3">
              <span className="w-32 shrink-0 truncate text-sm text-blue-100 sm:w-40">{item.file.name}</span>
              <div className="h-1.5 min-w-16 flex-1 overflow-hidden rounded-full bg-blue-800">
                <div className="h-full rounded-full bg-orange-600 transition-all" style={{ width: `${item.progress}%` }} />
              </div>
              {item.status === 'queued' && <span className="shrink-0 text-xs text-blue-300">Waiting</span>}
              {item.status === 'uploading' && (
                <span className="shrink-0 text-xs tabular-nums text-blue-300">{item.progress}%</span>
              )}
              {item.status === 'success' && (
                // A whole line on a phone, so a long title can't push the row wider than the screen.
                <span className="basis-full truncate text-xs text-blue-300 sm:max-w-xs sm:basis-auto">
                  {item.result?.title} · {item.result?.artist}
                </span>
              )}
            </div>
          ))}
        </div>
      )}

      {failed.length > 0 && (
        // Its own box with a red border, so failures can't hide among finished uploads in a long batch.
        <section className={others.length > 0 ? 'mt-4' : ''} aria-labelledby="failed-uploads-title">
          <div className="mb-2 flex items-center justify-between gap-2">
            <h3 id="failed-uploads-title" className="text-sm font-semibold text-red-300">
              Failed ({failed.length})
            </h3>
            {failed.length > 1 && (
              <button onClick={() => failed.forEach(retry)} className="btn-secondary btn-sm">
                Retry all {failed.length}
              </button>
            )}
          </div>
          <ul {...failedBox} className={`card divide-y divide-blue-800 border-red-700 ${failedBox.className}`}>
            {failed.map((item) => {
              const hint = hintFor(item);
              return (
                <li key={item.id} className="flex flex-col gap-1.5 px-4 py-3">
                  <div className="flex items-start gap-3">
                    <span className="min-w-0 flex-1 wrap-break-word text-sm font-medium text-white">{item.file.name}</span>
                    <button onClick={() => retry(item)} className="btn-secondary btn-sm shrink-0">
                      Retry
                    </button>
                  </div>
                  <p className="text-sm text-red-300">{item.error}</p>
                  {hint && <p className="text-xs text-blue-200">{hint}</p>}
                  <p className="text-xs text-blue-300">
                    {formatBytes(item.file.size)} · {extensionOf(item.file.name)} ·{' '}
                    {item.httpStatus === undefined ? 'no response' : `server answered ${item.httpStatus}`}
                    {item.failedAt ? ` · ${new Date(item.failedAt).toLocaleTimeString()}` : ''}
                  </p>
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </>
  );
}
