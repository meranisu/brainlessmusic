import { useState } from 'react';

/** The class that slides a new song in from the side the queue moved toward: forward for a higher index. */
export function useSwapClass(index: number): string {
  const [seen, setSeen] = useState(index);
  const [cls, setCls] = useState('track-swap-fwd');
  if (index !== seen) {
    setSeen(index);
    setCls(index < seen ? 'track-swap-back' : 'track-swap-fwd');
  }
  return cls;
}
