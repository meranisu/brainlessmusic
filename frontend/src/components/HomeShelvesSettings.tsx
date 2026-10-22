import { useState } from 'react';
import {
  defaultHomeLayout,
  HOME_SHELVES,
  loadHomeLayout,
  saveHomeLayout,
  type HomeLayout,
  type HomeShelfId,
} from '../lib/homeShelves';
import { ChevronDownIcon } from './icons';

/**
 * Options' Home section (A281): which shelves Home shows and in what order, for this device. Up and down buttons
 * rather than drag, so it works the same with a finger, a mouse and a keyboard.
 */
export function HomeShelvesSettings() {
  const [layout, setLayout] = useState(loadHomeLayout);

  function update(next: HomeLayout) {
    saveHomeLayout(next);
    setLayout(next);
  }

  function move(id: HomeShelfId, by: -1 | 1) {
    const order = [...layout.order];
    const from = order.indexOf(id);
    const to = from + by;
    if (to < 0 || to >= order.length) return;
    [order[from], order[to]] = [order[to], order[from]];
    update({ ...layout, order });
  }

  function toggle(id: HomeShelfId, show: boolean) {
    const hidden = show ? layout.hidden.filter((h) => h !== id) : [...layout.hidden, id];
    update({ ...layout, hidden });
  }

  const isDefault = JSON.stringify(layout) === JSON.stringify(defaultHomeLayout());

  return (
    <div>
      <ol className="card divide-y divide-blue-800/60 overflow-hidden">
        {layout.order.map((id, i) => {
          const shelf = HOME_SHELVES.find((s) => s.id === id)!;
          const shown = !layout.hidden.includes(id);
          return (
            <li key={id} className="flex items-center gap-3 px-4 py-2.5">
              <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-3">
                <input
                  type="checkbox"
                  checked={shown}
                  onChange={(e) => toggle(id, e.target.checked)}
                  className="h-4 w-4 shrink-0 accent-orange-400"
                />
                <span className="min-w-0">
                  <span className={`block truncate text-sm font-medium ${shown ? 'text-white' : 'text-blue-400'}`}>
                    {shelf.name}
                  </span>
                  <span className="block truncate text-xs text-blue-300">{shelf.detail}</span>
                </span>
              </label>
              <span className="flex shrink-0 gap-1">
                <button
                  type="button"
                  onClick={() => move(id, -1)}
                  disabled={i === 0}
                  aria-label={`Move ${shelf.name} up`}
                  className="btn-ghost btn-sm px-2 disabled:opacity-30"
                >
                  <ChevronDownIcon className="h-4 w-4 rotate-180" />
                </button>
                <button
                  type="button"
                  onClick={() => move(id, 1)}
                  disabled={i === layout.order.length - 1}
                  aria-label={`Move ${shelf.name} down`}
                  className="btn-ghost btn-sm px-2 disabled:opacity-30"
                >
                  <ChevronDownIcon className="h-4 w-4" />
                </button>
              </span>
            </li>
          );
        })}
      </ol>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-blue-400">On this device only. A shelf with nothing in it stays hidden anyway.</p>
        {!isDefault && (
          <button
            type="button"
            onClick={() => update(defaultHomeLayout())}
            className="text-xs text-blue-200 underline-offset-4 hover:text-white hover:underline"
          >
            Back to the usual order
          </button>
        )}
      </div>
    </div>
  );
}
