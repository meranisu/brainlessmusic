import { useState } from 'react';

/**
 * The class that slides a new song in from the side the queue moved toward: forward for a higher index. Keyed on the
 * song, so removing a row ahead of the current one (which shifts its index) does not animate as a skip back.
 */
export function useSwapClass(songId: number, index: number): string {
  const [seen, setSeen] = useState({ songId, index });
  const [cls, setCls] = useState('track-swap-fwd');
  if (songId !== seen.songId) {
    setCls(index < seen.index ? 'track-swap-back' : 'track-swap-fwd');
    setSeen({ songId, index });
  } else if (index !== seen.index) {
    setSeen({ songId, index });
  }
  return cls;
}
