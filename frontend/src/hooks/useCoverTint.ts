import { useEffect, useState } from 'react';
import { buildCoverUrl } from '../lib/apiClient';
import { useMediaUrl } from './useMediaUrl';

const SAMPLE = 16;
/** The tint is only ever mixed into the dark theme ground; capping the brightest channel keeps it from washing out. */
const MAX_CHANNEL = 150;

/** The cover's main colour: a 16x16 copy, each pixel weighted by how saturated it is so grey borders don't win. */
function averageColor(img: HTMLImageElement): string | null {
  try {
    const canvas = document.createElement('canvas');
    canvas.width = SAMPLE;
    canvas.height = SAMPLE;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return null;
    ctx.drawImage(img, 0, 0, SAMPLE, SAMPLE);
    const { data } = ctx.getImageData(0, 0, SAMPLE, SAMPLE);
    let r = 0;
    let g = 0;
    let b = 0;
    let total = 0;
    for (let i = 0; i < data.length; i += 4) {
      const max = Math.max(data[i], data[i + 1], data[i + 2]);
      const min = Math.min(data[i], data[i + 1], data[i + 2]);
      const saturation = max === 0 ? 0 : (max - min) / max;
      const weight = saturation * saturation + 0.05;
      r += data[i] * weight;
      g += data[i + 1] * weight;
      b += data[i + 2] * weight;
      total += weight;
    }
    if (total === 0) return null;
    r /= total;
    g /= total;
    b /= total;
    const scale = Math.min(1, MAX_CHANNEL / Math.max(r, g, b, 1));
    return `rgb(${Math.round(r * scale)} ${Math.round(g * scale)} ${Math.round(b * scale)})`;
  } catch {
    // A cover from another origin taints the canvas; the theme's own ground is used then.
    return null;
  }
}

/**
 * The colour to wash the desktop Now Playing view with, or null for the theme alone. Keeps the last colour while the
 * next cover loads, so the wash flows from song to song instead of dropping to the theme in between.
 */
export function useCoverTint(trackId: number): string | null {
  const { url } = useMediaUrl(`tracks:${trackId}:thumb`, () => buildCoverUrl('tracks', trackId, 'thumb'));
  const [color, setColor] = useState<string | null>(null);

  useEffect(() => {
    if (!url) return;
    let cancelled = false;
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      if (!cancelled) setColor(averageColor(img));
    };
    img.src = url;
    return () => {
      cancelled = true;
    };
  }, [url]);

  return color;
}
