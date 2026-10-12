/**
 * Volume levelling (A3): the server measures each track and sends `gainDb`; the player applies it. Turning a song down
 * only needs `audio.volume`. Turning one up past full needs Web Audio, so an element is routed through a `GainNode` the
 * first time it needs a boost, and stays routed: a media element can't be unhooked from its source node again.
 */

let context: AudioContext | null = null;
const boosts = new WeakMap<HTMLAudioElement, GainNode>();

/** The linear factor for a track's gain; 1 for a track the server hasn't measured yet. */
export function levelFactor(gainDb: number | null | undefined): number {
  return gainDb == null ? 1 : 10 ** (gainDb / 20);
}

/**
 * The element's gain node, created on first need when `create` is set. Null where Web Audio is missing or refuses,
 * and the caller then caps at `audio.volume = 1`, which is the song unlevelled upward and nothing worse.
 */
function boostNodeFor(audio: HTMLAudioElement, create: boolean): GainNode | null {
  const existing = boosts.get(audio);
  if (existing || !create) return existing ?? null;
  if (typeof AudioContext === 'undefined') return null;

  try {
    context ??= new AudioContext();
    const source = context.createMediaElementSource(audio);
    const gain = context.createGain();
    source.connect(gain).connect(context.destination);
    boosts.set(audio, gain);
    // An element added after a play started would otherwise go silent until the next play event.
    resumeLevelling();
    return gain;
  } catch {
    return null;
  }
}

/** A routed element is silent while the context is suspended, so every play nudges it. Safe to call any time. */
export function resumeLevelling(): void {
  if (context?.state === 'suspended') void context.resume().catch(() => {});
}

/** Sets an element's loudness to `level` (user volume times fade times levelling), boosting past 1 where it can. */
export function applyLevel(audio: HTMLAudioElement, level: number): void {
  const wanted = Math.max(level, 0);
  const boost = boostNodeFor(audio, wanted > 1);
  if (boost) {
    // Once routed the node carries the whole level, so the element's own volume stays out of the sum.
    audio.volume = 1;
    boost.gain.value = wanted;
  } else {
    audio.volume = Math.min(wanted, 1);
  }
}
