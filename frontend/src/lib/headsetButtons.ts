/**
 * What a headset press does (A203). Per device, like data saver. A browser never shows raw presses: a headset's play/pause
 * arrives as `play` or `pause`, and its next and previous buttons as `nexttrack` and `previoustrack`.
 */

export type HeadsetAction = 'playPause' | 'next' | 'previous' | 'seekForward' | 'seekBack' | 'none';
export type HeadsetSlot = 'single' | 'double' | 'triple' | 'nextButton' | 'previousButton';

export type HeadsetPrefs = Record<HeadsetSlot, HeadsetAction>;

export const HEADSET_ACTIONS: { id: HeadsetAction; name: string }[] = [
  { id: 'playPause', name: 'Play or pause' },
  { id: 'next', name: 'Next song' },
  { id: 'previous', name: 'Previous song' },
  { id: 'seekForward', name: 'Skip forward 10 seconds' },
  { id: 'seekBack', name: 'Skip back 10 seconds' },
  { id: 'none', name: 'Do nothing' },
];

export const HEADSET_SLOTS: { id: HeadsetSlot; name: string }[] = [
  { id: 'single', name: 'One press' },
  { id: 'double', name: 'Two presses' },
  { id: 'triple', name: 'Three presses' },
  { id: 'nextButton', name: 'Next button' },
  { id: 'previousButton', name: 'Previous button' },
];

export const DEFAULT_HEADSET_PREFS: HeadsetPrefs = {
  single: 'playPause',
  double: 'next',
  triple: 'previous',
  nextButton: 'next',
  previousButton: 'previous',
};

export const HEADSET_SEEK_SECONDS = 10;

/** Presses closer together than this count as one multi-press. */
export const PRESS_WINDOW_MS = 400;

const HEADSET_KEY = 'brainlessmusic.headsetButtons';

export function loadHeadsetPrefs(): HeadsetPrefs {
  try {
    const stored = JSON.parse(localStorage.getItem(HEADSET_KEY) ?? '{}') as Record<string, unknown>;
    const prefs = { ...DEFAULT_HEADSET_PREFS };
    for (const { id } of HEADSET_SLOTS) {
      const value = stored[id];
      if (HEADSET_ACTIONS.some((action) => action.id === value)) prefs[id] = value as HeadsetAction;
    }
    return prefs;
  } catch {
    // Blocked or malformed storage: the defaults are the safe thing to guess.
    return { ...DEFAULT_HEADSET_PREFS };
  }
}

export function saveHeadsetPrefs(prefs: HeadsetPrefs): void {
  try {
    localStorage.setItem(HEADSET_KEY, JSON.stringify(prefs));
  } catch {
    // Still applies for this session; it just won't survive a reload.
  }
}

/**
 * Counts presses that land within [PRESS_WINDOW_MS] of each other and fires the action for the count. With nothing mapped
 * to two or three presses a single press fires at once, so the common setup has no delay.
 */
export function createPressCounter(getPrefs: () => HeadsetPrefs, fire: (action: HeadsetAction) => void) {
  let count = 0;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const settle = () => {
    const prefs = getPrefs();
    const action = count === 1 ? prefs.single : count === 2 ? prefs.double : prefs.triple;
    count = 0;
    timer = null;
    fire(action);
  };

  return {
    press() {
      if (timer) clearTimeout(timer);
      timer = null;
      count += 1;
      const prefs = getPrefs();
      const mostPresses = prefs.triple !== 'none' ? 3 : prefs.double !== 'none' ? 2 : 1;
      if (count >= mostPresses) settle();
      else timer = setTimeout(settle, PRESS_WINDOW_MS);
    },
    cancel() {
      if (timer) clearTimeout(timer);
      timer = null;
      count = 0;
    },
  };
}
