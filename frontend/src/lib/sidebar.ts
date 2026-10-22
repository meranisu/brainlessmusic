import { getItem, setItem } from './safeStorage';

const SIDEBAR_KEY = 'brainlessmusic.sidebarCollapsed';

/**
 * Whether the desktop sidebar is folded to its icon rail (A275). Per device, like the Library view. Null until the
 * user picks, so the width decides: a rail below `lg`, open from it.
 */
export function loadSidebarCollapsed(): boolean | null {
  const saved = getItem(SIDEBAR_KEY);
  return saved === 'true' ? true : saved === 'false' ? false : null;
}

export function saveSidebarCollapsed(collapsed: boolean): void {
  setItem(SIDEBAR_KEY, String(collapsed));
}
