import { getItem, setItem } from './safeStorage';

export type LibraryView = 'simple' | 'full';

const LIBRARY_VIEW_KEY = 'brainlessmusic.libraryView';

/** Per device, like data saver and volume. Simple by default. */
export function loadLibraryView(): LibraryView {
  return getItem(LIBRARY_VIEW_KEY) === 'full' ? 'full' : 'simple';
}

export function saveLibraryView(view: LibraryView): void {
  setItem(LIBRARY_VIEW_KEY, view);
}
