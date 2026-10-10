export type LibraryView = 'simple' | 'full';

const LIBRARY_VIEW_KEY = 'brainlessmusic.libraryView';

/** Per device, like data saver and volume. Simple by default. */
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
