/** On this day: what the user played on today's date in earlier years. */
import type { TrackSummary } from '../types/api';
import { apiClient } from './apiClient';

export interface OnThisDayYear {
  year: number;
  yearsAgo: number;
  tracks: TrackSummary[];
}

export function fetchOnThisDay(): Promise<{ date: string; years: OnThisDayYear[] }> {
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  return apiClient.get<{ date: string; years: OnThisDayYear[] }>(`/me/on-this-day?tz=${encodeURIComponent(tz)}`);
}
