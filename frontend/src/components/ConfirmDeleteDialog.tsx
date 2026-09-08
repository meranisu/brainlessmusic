interface ConfirmDeleteDialogProps {
  titles: string[];
  isDeleting: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDeleteDialog({ titles, isDeleting, onConfirm, onCancel }: ConfirmDeleteDialogProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onCancel}>
      <div className="card w-full max-w-sm p-5" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center gap-2.5">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-red-700 text-white">
            !
          </span>
          <h2 className="text-sm font-semibold text-white">
            Delete {titles.length === 1 ? 'this track' : `${titles.length} tracks`}?
          </h2>
        </div>
        <ul className="mb-4 max-h-32 space-y-0.5 overflow-y-auto rounded-md border border-blue-800 bg-blue-950/60 px-3 py-2 text-sm text-blue-200">
          {titles.map((t, i) => (
            <li key={i} className="truncate">
              {t}
            </li>
          ))}
        </ul>
        <p className="mb-4 text-xs text-blue-400">
          This removes the file from disk and the database entry. Permanent — there's no undo.
        </p>
        <div className="flex justify-end gap-2">
          <button onClick={onCancel} className="btn-secondary btn-sm">
            Cancel
          </button>
          <button onClick={onConfirm} disabled={isDeleting} className="btn-danger btn-sm">
            {isDeleting ? 'Deleting…' : 'Delete'}
          </button>
        </div>
      </div>
    </div>
  );
}
