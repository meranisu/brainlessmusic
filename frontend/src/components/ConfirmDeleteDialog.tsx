interface ConfirmDeleteDialogProps {
  titles: string[];
  isDeleting: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDeleteDialog({ titles, isDeleting, onConfirm, onCancel }: ConfirmDeleteDialogProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onCancel}>
      <div
        className="w-full max-w-sm rounded-lg border border-neutral-800 bg-neutral-900 p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="mb-2 text-sm font-semibold text-neutral-100">
          Delete {titles.length === 1 ? 'this track' : `${titles.length} tracks`}?
        </h2>
        <ul className="mb-4 max-h-32 space-y-0.5 overflow-y-auto text-sm text-neutral-400">
          {titles.map((t, i) => (
            <li key={i} className="truncate">
              {t}
            </li>
          ))}
        </ul>
        <p className="mb-4 text-xs text-neutral-600">
          This removes the file from disk and the database entry. Permanent — there's no undo.
        </p>
        <div className="flex justify-end gap-2">
          <button
            onClick={onCancel}
            className="rounded-md border border-neutral-700 px-3 py-1.5 text-sm text-neutral-300"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={isDeleting}
            className="rounded-md bg-red-600 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
          >
            {isDeleting ? 'Deleting…' : 'Delete'}
          </button>
        </div>
      </div>
    </div>
  );
}
