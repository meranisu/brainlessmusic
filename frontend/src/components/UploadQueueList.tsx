import { useUploads } from './UploadProvider';

/** The upload queue, shared by the Upload page and the Control Center. Renders nothing while the queue is empty. */
export function UploadQueueList() {
  const { queue, retry, clearFinished } = useUploads();
  if (queue.length === 0) return null;

  const succeeded = queue.filter((q) => q.status === 'success').length;
  const failed = queue.filter((q) => q.status === 'error').length;
  const finished = succeeded + failed;

  return (
    <>
      <div className="mb-2 flex items-center justify-between gap-2 text-sm">
        <span className="text-blue-100">
          {succeeded} uploaded{failed > 0 ? `, ${failed} failed` : ''} of {queue.length}
        </span>
        {finished > 0 && (
          <button onClick={clearFinished} className="btn-secondary btn-sm">
            Clear finished
          </button>
        )}
      </div>
      <div className="card divide-y divide-blue-800">
        {queue.map((item) => (
          <div key={item.id} className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-4 py-3">
            <span className="w-32 shrink-0 truncate text-sm text-blue-100 sm:w-40">{item.file.name}</span>
            <div className="h-1.5 min-w-16 flex-1 overflow-hidden rounded-full bg-blue-800">
              <div
                className={`h-full rounded-full transition-all ${
                  item.status === 'error' ? 'bg-red-500' : 'bg-orange-600'
                }`}
                style={{ width: `${item.progress}%` }}
              />
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
            {item.status === 'error' && (
              <div className="flex basis-full items-center gap-3 sm:basis-auto">
                <span className="min-w-0 flex-1 text-xs text-red-300">{item.error}</span>
                <button onClick={() => retry(item)} className="btn-secondary btn-sm shrink-0">
                  Retry
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
    </>
  );
}
