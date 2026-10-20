import type { AudioFeatures } from '../db/audioFeatures.js';

/** Low, since nothing here needs more than 5 kHz: tempo and loudness live well under it. */
export const ANALYSIS_RATE = 11025;
/** Samples per analysis frame, about 23 ms at 11025 Hz. */
export const HOP = 256;
const MIN_BPM = 60;
const MAX_BPM = 180;
/** Frames quieter than this RMS are left out of dynamics, so silence between songs on a live album doesn't count. */
const SILENT_RMS = 1e-4;
/** A lag scoring at least this share of the best counts as the beat, so a half-tempo match doesn't win. */
const OCTAVE_SHARE = 0.85;
/** Onset strength, as a share of mean loudness, under which there is no beat to find: a held tone, a drone. */
const MIN_ONSET_SHARE = 0.02;

function percentile(sorted: readonly number[], share: number): number {
  if (sorted.length === 0) return 0;
  return sorted[Math.min(sorted.length - 1, Math.floor(share * sorted.length))];
}

/**
 * The tempo whose beat period best repeats the onset envelope, by autocorrelation over 60-180 BPM. Null when no lag
 * stands out from the envelope's own noise, so ambient tracks don't get a made-up tempo.
 */
export function estimateTempo(onsets: readonly number[], frameSeconds: number): number | null {
  // Smoothed, so a beat whose period falls between two whole frames still lines up with itself.
  const smooth = onsets.map((value, i) => 0.25 * (onsets[i - 1] ?? value) + 0.5 * value + 0.25 * (onsets[i + 1] ?? value));
  const mean = smooth.reduce((sum, value) => sum + value, 0) / (smooth.length || 1);
  const centred = smooth.map((value) => value - mean);
  const energy = centred.reduce((sum, value) => sum + value * value, 0);
  if (energy === 0) return null;

  const minLag = Math.max(1, Math.floor(60 / (MAX_BPM * frameSeconds)));
  const maxLag = Math.ceil(60 / (MIN_BPM * frameSeconds));
  const scores: number[] = [];
  let best = 0;
  for (let lag = minLag; lag <= maxLag && lag < centred.length; lag += 1) {
    let sum = 0;
    for (let i = lag; i < centred.length; i += 1) sum += centred[i] * centred[i - lag];
    scores[lag] = sum / energy;
    if (scores[lag] > best) best = scores[lag];
  }

  // Below this, the best lag is noise; a click track scores about 0.9, white noise under 0.05.
  if (best < 0.1) return null;
  // A beat also repeats at twice its period, often scoring as high; the shortest lag near the best is the beat.
  const bestLag = scores.findIndex((score) => score !== undefined && score >= best * OCTAVE_SHARE);
  return Math.round((60 / (bestLag * frameSeconds)) * 10) / 10;
}

/** Features from mono samples in -1..1. Pure, so tests can feed it synthetic signals. */
export function analyzeSamples(samples: Float32Array, rate: number): AudioFeatures {
  const frames = Math.floor(samples.length / HOP);
  const rms: number[] = [];
  let crossings = 0;

  for (let frame = 0; frame < frames; frame += 1) {
    let sum = 0;
    for (let i = frame * HOP; i < (frame + 1) * HOP; i += 1) {
      sum += samples[i] * samples[i];
      if (i > 0 && samples[i] >= 0 !== samples[i - 1] >= 0) crossings += 1;
    }
    rms.push(Math.sqrt(sum / HOP));
  }

  const energy = rms.reduce((sum, value) => sum + value, 0) / (rms.length || 1);
  const loudFrames = rms
    .filter((value) => value > SILENT_RMS)
    .map((value) => 20 * Math.log10(value))
    .sort((a, b) => a - b);
  const dynamics = percentile(loudFrames, 0.9) - percentile(loudFrames, 0.1);
  const onsets = rms.map((value, i) => (i === 0 ? 0 : Math.max(0, value - rms[i - 1])));

  const onsetShare = onsets.reduce((sum, value) => sum + value, 0) / (rms.reduce((sum, value) => sum + value, 0) || 1);

  return {
    tempo: onsetShare < MIN_ONSET_SHARE ? null : estimateTempo(onsets, HOP / rate),
    energy: Math.round(energy * 1e5) / 1e5,
    dynamics: Math.round(dynamics * 100) / 100,
    brightness: Math.round((crossings / (frames * HOP || 1)) * 1e5) / 1e5,
  };
}
