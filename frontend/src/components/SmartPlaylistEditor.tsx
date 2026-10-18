import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { useDialogA11y } from '../hooks/useDialogA11y';
import { useScrollLock } from '../hooks/useScrollLock';
import { apiClient } from '../lib/apiClient';
import { checkPlaylistName } from '../lib/playlistName';
import {
  FIELDS,
  FIELD_ORDER,
  MAX_LIMIT,
  MAX_RULES,
  SORTS,
  fromSmartRules,
  hasValueBox,
  newRow,
  opDef,
  startingDraft,
  toSmartRules,
  type FieldKey,
  type RuleDraft,
  type RulesDraft,
} from '../lib/smartRules';
import type { PlaylistSummary, SmartPreview, SmartRules, SmartSort } from '../types/api';
import { CloseIcon, PlusIcon } from './icons';
import { PlaylistNameField } from './PlaylistNameField';
import { useToast } from './ToastProvider';

type EditorMode = { kind: 'create' } | { kind: 'edit'; playlistId: number; saved: SmartRules };

/** Rows of the preview list shown before "and N more". */
const PREVIEW_ROWS = 5;
/** Wait after the last keystroke before asking the server what the rules pick. */
const PREVIEW_DELAY_MS = 400;

/**
 * Makes a smart playlist (A207), or changes the rules of one. Each rule is a sentence you fill in; under them, the
 * server's answer to "what would this pick right now" for you, so a rule that picks nothing shows before you save.
 */
export function SmartPlaylistEditor({ mode, onClose }: { mode: EditorMode; onClose: () => void }) {
  useScrollLock();
  const dialogRef = useDialogA11y<HTMLDivElement>(onClose);
  const titleId = useId();
  const nameFieldId = useId();
  const nameInputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const isCreate = mode.kind === 'create';

  const [name, setName] = useState('');
  const [triedToSave, setTriedToSave] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [draft, setDraft] = useState<RulesDraft>(() => (mode.kind === 'edit' ? fromSmartRules(mode.saved) : startingDraft()));

  // Names you already use, for the duplicate warning on a new one.
  const mine = useQuery({
    queryKey: ['playlists'],
    queryFn: () => apiClient.get<{ playlists: PlaylistSummary[] }>('/playlists'),
    enabled: isCreate,
  });
  const takenNames = mine.data?.playlists.map((p) => p.name) ?? [];
  const nameCheck = checkPlaylistName(name, takenNames, { reportBlank: triedToSave });

  const built = toSmartRules(draft);
  const builtKey = 'rules' in built ? JSON.stringify(built.rules) : null;
  const [askedKey, setAskedKey] = useState(builtKey);
  useEffect(() => {
    const timer = setTimeout(() => setAskedKey(builtKey), PREVIEW_DELAY_MS);
    return () => clearTimeout(timer);
  }, [builtKey]);

  const preview = useQuery({
    queryKey: ['smart-preview', askedKey],
    queryFn: () => apiClient.post<SmartPreview>('/playlists/smart/preview', { rules: JSON.parse(askedKey!) }),
    enabled: askedKey !== null,
    placeholderData: keepPreviousData,
  });

  const saveMutation = useMutation({
    mutationFn: async (rules: SmartRules) => {
      if (mode.kind === 'edit') {
        await apiClient.patch(`/playlists/${mode.playlistId}`, { rules });
        return mode.playlistId;
      }
      const created = await apiClient.post<{ id: number; name: string }>('/playlists', { name: nameCheck.trimmed, rules });
      return created.id;
    },
    onSuccess: (id) => {
      queryClient.invalidateQueries({ queryKey: ['playlists'] });
      queryClient.invalidateQueries({ queryKey: ['playlist', id] });
      showToast(isCreate ? `Created “${nameCheck.trimmed}”` : 'Rules saved');
      onClose();
      if (isCreate) navigate(`/playlists/${id}`);
    },
    onError: (err) => setServerError(err instanceof Error ? err.message : 'Could not save'),
  });

  function patchRow(key: number, patch: Partial<RuleDraft>) {
    setServerError(null);
    setDraft((d) => ({ ...d, rows: d.rows.map((r) => (r.key === key ? { ...r, ...patch } : r)) }));
  }

  function changeField(row: RuleDraft, field: FieldKey) {
    const fresh = newRow(field);
    patchRow(row.key, { field, op: fresh.op, value: fresh.value });
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    setTriedToSave(true);
    if (isCreate) {
      const check = checkPlaylistName(name, takenNames, { reportBlank: true });
      if (check.error) {
        nameInputRef.current?.focus();
        return;
      }
    }
    if ('error' in built) return;
    saveMutation.mutate(built.rules);
  }

  const ruleError = 'error' in built ? built.error : null;
  const shown = preview.data;
  const stale = askedKey !== builtKey || preview.isPlaceholderData;

  return createPortal(
    <div className="motion-scrim fixed inset-0 z-50 flex items-end justify-center bg-black/60 sm:items-center sm:p-4" onClick={onClose}>
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        className="motion-sheet card flex max-h-[92dvh] w-full flex-col rounded-b-none outline-none sm:max-w-2xl sm:rounded-b-xl"
      >
        <form onSubmit={submit} noValidate className="flex min-h-0 flex-1 flex-col">
          <div className="flex items-start gap-3 border-b border-blue-800 p-4">
            <div className="min-w-0 flex-1">
              <h2 id={titleId} className="text-base font-semibold text-white">
                {isCreate ? 'New smart playlist' : 'Edit rules'}
              </h2>
              <p className="text-xs text-blue-300">
                It fills itself each time you open it, from your own plays and likes. Nobody else sees it.
              </p>
            </div>
            <button type="button" onClick={onClose} aria-label="Close" className="btn-ghost tap-target shrink-0 p-1.5">
              <CloseIcon />
            </button>
          </div>

          <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4">
            {isCreate && (
              <PlaylistNameField
                id={nameFieldId}
                inputRef={nameInputRef}
                value={name}
                onChange={(v) => {
                  setName(v);
                  setServerError(null);
                }}
                check={nameCheck}
                serverError={serverError}
                label="Smart playlist name"
                placeholder="Name it, like “Not played in a while”"
                autoFocus
              />
            )}

            <div className="flex flex-wrap items-center gap-2 text-sm text-blue-100">
              <label htmlFor={`${titleId}-match`}>Songs that match</label>
              <select
                id={`${titleId}-match`}
                value={draft.match}
                onChange={(e) => setDraft((d) => ({ ...d, match: e.target.value as 'all' | 'any' }))}
                className="input w-auto"
              >
                <option value="all">all</option>
                <option value="any">any</option>
              </select>
              <span>of these rules</span>
            </div>

            <ol className="flex flex-col gap-2">
              {draft.rows.map((row, i) => {
                const def = FIELDS[row.field];
                const op = opDef(row.field, row.op);
                const label = (what: string) => `Rule ${i + 1} ${what}`;
                return (
                  <li key={row.key} className="flex flex-col gap-1 rounded-md border border-blue-800 p-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <select
                        value={row.field}
                        onChange={(e) => changeField(row, e.target.value as FieldKey)}
                        aria-label={label('field')}
                        className="input min-w-0 flex-1 basis-40"
                      >
                        {FIELD_ORDER.map((f) => (
                          <option key={f} value={f}>
                            {FIELDS[f].label}
                          </option>
                        ))}
                      </select>

                      {def.value === 'yesno' ? (
                        <select
                          value={row.value}
                          onChange={(e) => patchRow(row.key, { value: e.target.value })}
                          aria-label={label('answer')}
                          className="input w-auto"
                        >
                          <option value="yes">Yes</option>
                          <option value="no">No</option>
                        </select>
                      ) : (
                        <>
                          <select
                            value={row.op}
                            onChange={(e) => patchRow(row.key, { op: e.target.value })}
                            aria-label={label('comparison')}
                            className="input w-auto min-w-0"
                          >
                            {def.ops.map((o) => (
                              <option key={o.op} value={o.op}>
                                {o.label}
                              </option>
                            ))}
                          </select>
                          {hasValueBox(row.field, row.op) &&
                            (def.value === 'text' ? (
                              <input
                                value={row.value}
                                onChange={(e) => patchRow(row.key, { value: e.target.value })}
                                aria-label={label('value')}
                                maxLength={100}
                                autoComplete="off"
                                className="input min-w-0 flex-1 basis-40"
                              />
                            ) : (
                              <input
                                value={row.value}
                                onChange={(e) => patchRow(row.key, { value: e.target.value })}
                                aria-label={label('value')}
                                inputMode={def.value === 'minutes' ? 'decimal' : 'numeric'}
                                autoComplete="off"
                                className="input w-24"
                              />
                            ))}
                          {op.unit && <span className="text-sm text-blue-200">{op.unit}</span>}
                        </>
                      )}

                      <button
                        type="button"
                        onClick={() => setDraft((d) => ({ ...d, rows: d.rows.filter((r) => r.key !== row.key) }))}
                        disabled={draft.rows.length === 1}
                        aria-label={`Remove rule ${i + 1}`}
                        className="btn-ghost tap-target ml-auto shrink-0 p-1.5"
                      >
                        <CloseIcon />
                      </button>
                    </div>
                    {op.hint && <p className="text-xs text-blue-300">{op.hint}</p>}
                  </li>
                );
              })}
            </ol>

            <div>
              <button
                type="button"
                onClick={() => setDraft((d) => ({ ...d, rows: [...d.rows, newRow('myPlays', { op: 'lt', value: '3' })] }))}
                disabled={draft.rows.length >= MAX_RULES}
                className="btn-secondary btn-sm"
              >
                <PlusIcon className="h-3.5 w-3.5" /> Add a rule
              </button>
              {draft.rows.length >= MAX_RULES && (
                <span className="ml-2 text-xs text-blue-300">{MAX_RULES} rules is the most.</span>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2 text-sm text-blue-100">
              <label htmlFor={`${titleId}-sort`}>Order</label>
              <select
                id={`${titleId}-sort`}
                value={draft.sort}
                onChange={(e) => setDraft((d) => ({ ...d, sort: e.target.value as SmartSort }))}
                className="input w-auto"
              >
                {SORTS.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
              <label htmlFor={`${titleId}-limit`} className="ml-2">
                Up to
              </label>
              <input
                id={`${titleId}-limit`}
                value={draft.limit}
                onChange={(e) => setDraft((d) => ({ ...d, limit: e.target.value }))}
                inputMode="numeric"
                autoComplete="off"
                aria-describedby={`${titleId}-limit-max`}
                className="input w-20"
              />
              <span id={`${titleId}-limit-max`}>songs (at most {MAX_LIMIT})</span>
            </div>

            <section aria-live="polite" aria-label="What these rules pick" className="rounded-md border border-blue-800 bg-blue-950 p-3">
              {ruleError ? (
                <p className="text-sm text-blue-200">{ruleError}</p>
              ) : preview.isError ? (
                <div className="flex flex-col items-start gap-2">
                  <p role="alert" className="text-sm text-red-300">
                    {preview.error instanceof Error ? preview.error.message : 'Could not check the rules.'}
                  </p>
                  <button type="button" onClick={() => preview.refetch()} className="btn-secondary btn-sm">
                    Try again
                  </button>
                </div>
              ) : !shown ? (
                <p className="text-sm text-blue-300">Checking what these pick…</p>
              ) : (
                <div className={`flex flex-col gap-1.5 ${stale ? 'opacity-70' : ''}`}>
                  <p className="text-sm font-medium text-white">
                    {shown.trackCount === 0
                      ? 'Nothing matches yet.'
                      : `${shown.trackCount} song${shown.trackCount === 1 ? '' : 's'} right now`}
                  </p>
                  {shown.tracks.length > 0 && (
                    <ul className="flex flex-col gap-0.5 text-xs text-blue-200">
                      {shown.tracks.slice(0, PREVIEW_ROWS).map((t) => (
                        <li key={t.id} className="truncate">
                          {t.title}
                          {t.artist && <span className="text-blue-300">, {t.artist}</span>}
                        </li>
                      ))}
                      {shown.trackCount > PREVIEW_ROWS && (
                        <li className="text-blue-300">and {shown.trackCount - PREVIEW_ROWS} more</li>
                      )}
                    </ul>
                  )}
                </div>
              )}
            </section>

            {!isCreate && serverError && (
              <p role="alert" className="text-sm text-red-300">
                {serverError}
              </p>
            )}
          </div>

          <div className="flex items-center justify-end gap-2 border-t border-blue-800 px-4 py-3">
            <button type="button" onClick={onClose} className="btn-secondary btn-md">
              Cancel
            </button>
            <button type="submit" disabled={saveMutation.isPending} className="btn-primary btn-md">
              {saveMutation.isPending ? 'Saving…' : isCreate ? 'Create playlist' : 'Save rules'}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body,
  );
}
