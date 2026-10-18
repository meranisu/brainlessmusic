import { useEffect, useRef, useState } from "react";
import type { PlayerContextValue } from "../components/PlayerBar";

/** How long a removed row takes to fold away before the queue actually loses it. Matches `.np-row-collapse`. */
const COLLAPSE_MS = 220;

/**
 * Removes a queue row after it has folded away. The row is named by its place and its song, so a skip meanwhile can't
 * make the timer remove a different one. Rows use `np-row-wrap` / `np-row-inner` and add `np-row-collapse` when folding.
 */
export function useFoldRemove(player: PlayerContextValue) {
  const [folding, setFolding] = useState<{ at: number; id: number } | null>(
    null,
  );
  const latest = useRef(player);
  useEffect(() => {
    latest.current = player;
  });

  function fold(at: number) {
    const track = player.queue[at];
    if (!track || folding) return;
    setFolding({ at, id: track.id });
    window.setTimeout(() => {
      if (latest.current.queue[at]?.id === track.id)
        latest.current.removeAt(at);
      setFolding(null);
    }, COLLAPSE_MS);
  }

  return { folding, fold };
}
