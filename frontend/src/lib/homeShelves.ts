import { getJSON, setJSON } from './safeStorage';

/** Every shelf Home can show, in its default order (A276, A280, A281). */
export const HOME_SHELVES = [
  { id: 'quick-picks', name: 'Quick picks', detail: 'Six songs you play most' },
  { id: 'jump-back-in', name: 'Jump back in', detail: 'Albums, playlists and mixes you left part way' },
  { id: 'mixes', name: "Today's mixes", detail: 'Made each day from what you play' },
  { id: 'recent', name: 'Recently played', detail: 'Albums you played, newest first' },
  { id: 'because', name: 'Because you played', detail: 'Songs like your last one' },
  { id: 'playlists', name: 'Your playlists', detail: 'Yours, newest first' },
  { id: 'friends', name: 'Friends listening', detail: 'Only while someone is playing' },
  { id: 'on-this-day', name: 'On this day', detail: 'This date in other years' },
  { id: 'new', name: 'New in your library', detail: 'Albums that arrived last' },
] as const;

export type HomeShelfId = (typeof HOME_SHELVES)[number]['id'];

export interface HomeLayout {
  order: HomeShelfId[];
  hidden: HomeShelfId[];
}

const HOME_LAYOUT_KEY = 'brainlessmusic.homeShelves';

const DEFAULT_ORDER = HOME_SHELVES.map((shelf) => shelf.id);

function isShelfId(value: unknown): value is HomeShelfId {
  return DEFAULT_ORDER.includes(value as HomeShelfId);
}

/**
 * Home's order and hidden shelves, per device like the sidebar (A281). Unknown ids from an older or newer build are
 * dropped, and a shelf the saved order doesn't name yet (one added since) goes at its default place.
 */
export function loadHomeLayout(): HomeLayout {
  const saved = getJSON(HOME_LAYOUT_KEY) as Partial<Record<keyof HomeLayout, unknown>> | null;
  const savedOrder = Array.isArray(saved?.order) ? saved.order.filter(isShelfId) : [];
  const order = [...new Set(savedOrder)];
  DEFAULT_ORDER.forEach((id, i) => {
    if (order.includes(id)) return;
    // After the shelf that comes before it by default, or first.
    const before = DEFAULT_ORDER.slice(0, i).reverse().find((prev) => order.includes(prev));
    order.splice(before ? order.indexOf(before) + 1 : 0, 0, id);
  });
  const hidden = Array.isArray(saved?.hidden) ? [...new Set(saved.hidden.filter(isShelfId))] : [];
  return { order, hidden };
}

export function saveHomeLayout(layout: HomeLayout): void {
  setJSON(HOME_LAYOUT_KEY, layout);
}

export function defaultHomeLayout(): HomeLayout {
  return { order: [...DEFAULT_ORDER], hidden: [] };
}
