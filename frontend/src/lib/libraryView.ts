export type LibraryView = 'simple' | 'full';

const LIBRARY_VIEW_KEY = 'brainlessmusic.libraryView';

/** Per-device, like the data-saver and volume preferences: a phone and a
 *  desktop sharing a login want different defaults. Simple until told
 *  otherwise — the arcade select is the listening surface, the table is the
 *  one you go looking for. */
export function loadLibraryView(): LibraryView {
  try {
    return localStorage.getItem(LIBRARY_VIEW_KEY) === 'full' ? 'full' : 'simple';
  } catch {
    return 'simple';
  }
}

export function saveLibraryView(view: LibraryView): void {
  try {
    localStorage.setItem(LIBRARY_VIEW_KEY, view);
  } catch {
    // Applies for this session; just won't survive a reload.
  }
}
