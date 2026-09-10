import { useCallback, useEffect, useRef, useState } from "react";
import type { ItemKey } from "./sizeCache";

export interface UseViewportRevealOptions {
  /** Total number of items available. */
  count: number;
  /** First index of the rendered range, from the windowing layer. */
  start: number;
  /** End of the rendered range, exclusive. */
  end: number;
  /** Items revealed per wave. Default 20. */
  batchSize?: number;
  /** Delay in milliseconds between waves. Default 50. */
  interval?: number;
  /** Index of the first item to reveal. Items before it are never revealed. Default 0. */
  startIndex?: number;
  /** Set to false to pause the reveal. Nothing new appears, nothing is hidden. Default true. */
  enabled?: boolean;
  /**
   * Stable key per index. When given, revealed state is tracked by key, so
   * sorting or filtering the list does not re-stagger rows the reader has
   * already seen.
   */
  getItemKey?: (index: number) => ItemKey;
}

export interface UseViewportRevealResult {
  /** True when the item at this index has been revealed. Referentially stable. */
  isRevealed: (index: number) => boolean;
  /** Unrevealed items inside the rendered range. */
  pendingCount: number;
  /** Forget everything. The next render reveals the first batch of the window. */
  reset: () => void;
}

/**
 * Reveals up to `limit` of the unrevealed rows in [lo, hi), ascending.
 * Returns how many were added.
 */
function revealRange(
  revealed: Set<ItemKey>,
  lo: number,
  hi: number,
  limit: number,
  keyOf: (index: number) => ItemKey
): number {
  let added = 0;
  for (let index = lo; index < hi && added < limit; index++) {
    const key = keyOf(index);
    if (revealed.has(key)) continue;
    revealed.add(key);
    added++;
  }
  return added;
}

/**
 * Reveals the rows inside the rendered window in timed batches.
 *
 * Where `useRenderWave` counts forward from `startIndex` regardless of where
 * the reader is, this follows the window: rows currently on screen are
 * revealed first, rows that scroll away stay revealed, and rows that scroll
 * into view are picked up by the following waves. Work per wave is bounded by
 * the size of the window, not by the length of the list.
 */
export function useViewportReveal({
  count,
  start,
  end,
  batchSize = 20,
  interval = 50,
  startIndex = 0,
  enabled = true,
  getItemKey,
}: UseViewportRevealOptions): UseViewportRevealResult {
  const batch = Math.max(1, Math.floor(batchSize));
  const safeStart = Math.max(0, startIndex);
  const lo = Math.max(start, safeStart, 0);
  const hi = Math.min(end, count);

  const revealedRef = useRef<Set<ItemKey>>(new Set());
  const keyedRef = useRef(getItemKey !== undefined);
  const [version, bumpVersion] = useState(0);

  const keyOf = getItemKey ?? ((index: number) => index);

  const keyed = getItemKey !== undefined;
  if (keyedRef.current !== keyed) {
    keyedRef.current = keyed;
    revealedRef.current = new Set();
  }

  // Revealed during render so the first paint has content and SSR matches; keep it idempotent.
  if (revealedRef.current.size === 0 && hi > lo) {
    revealRange(revealedRef.current, lo, hi, batch, keyOf);
  }

  let pendingCount = 0;
  for (let index = lo; index < hi; index++) {
    if (!revealedRef.current.has(keyOf(index))) pendingCount++;
  }
  const hasPending = pendingCount > 0;

  const latest = useRef({ lo, hi, batch, safeStart, keyOf });
  latest.current = { lo, hi, batch, safeStart, keyOf };

  const isRevealed = useCallback((index: number) => {
    const current = latest.current;
    return (
      index >= current.safeStart &&
      revealedRef.current.has(current.keyOf(index))
    );
  }, []);

  // window is read at fire time, not a dependency, so scrolling cannot push the next wave out.
  useEffect(() => {
    if (!enabled || !hasPending) return;

    let rafId: number | null = null;
    const timer = setTimeout(() => {
      rafId = requestAnimationFrame(() => {
        const current = latest.current;
        const added = revealRange(
          revealedRef.current,
          current.lo,
          current.hi,
          current.batch,
          current.keyOf
        );
        if (added > 0) bumpVersion((v) => v + 1);
      });
    }, interval);

    return () => {
      clearTimeout(timer);
      if (rafId !== null) cancelAnimationFrame(rafId);
    };
  }, [enabled, interval, hasPending, version]);

  const reset = useCallback(() => {
    revealedRef.current = new Set();
    bumpVersion((v) => v + 1);
  }, []);

  return { isRevealed, pendingCount, reset };
}
