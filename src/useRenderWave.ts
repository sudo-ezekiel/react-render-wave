import { useCallback, useEffect, useMemo, useRef, useState } from "react";

export interface UseRenderWaveOptions {
  /** Total number of items available. */
  length: number;
  /** Items revealed per wave. Default 20. */
  batchSize?: number;
  /** Delay in milliseconds between waves. Default 50. */
  interval?: number;
  /** Index of the first item to reveal. Items before it are never revealed. Default 0. */
  startIndex?: number;
  /** Set to false to pause the reveal. The first batch stays visible. Default true. */
  enabled?: boolean;
  /** Called once each time the reveal reaches the end of the list. */
  onComplete?: () => void;
}

export interface UseRenderWaveResult {
  /** Number of items revealed so far, counting from startIndex. */
  count: number;
  /** Revealed indexes: startIndex up to startIndex + count (exclusive). */
  indexes: number[];
  /** True when everything from startIndex to the end of the list is revealed. */
  isComplete: boolean;
  /** Restart the reveal from the first batch. */
  reset: () => void;
}

/**
 * Reveals a list progressively in timed batches.
 *
 * The first batch is available on the initial render (no empty flash and
 * deterministic SSR markup). Each following wave is committed on an animation
 * frame after `interval` has elapsed.
 */
export function useRenderWave({
  length,
  batchSize = 20,
  interval = 50,
  startIndex = 0,
  enabled = true,
  onComplete,
}: UseRenderWaveOptions): UseRenderWaveResult {
  const batch = Math.max(1, Math.floor(batchSize));
  const safeStart = Math.max(0, Math.min(startIndex, length));

  const [steps, setSteps] = useState(0);

  const cursor = Math.min(safeStart + batch * (steps + 1), length);
  const isComplete = cursor >= length;
  const count = Math.max(0, cursor - safeStart);

  const onCompleteRef = useRef(onComplete);
  useEffect(() => {
    onCompleteRef.current = onComplete;
  });

  useEffect(() => {
    if (!enabled || isComplete) return;

    let rafId: number | null = null;
    const timer = setTimeout(() => {
      rafId = requestAnimationFrame(() => {
        setSteps((s) => s + 1);
      });
    }, interval);

    return () => {
      clearTimeout(timer);
      if (rafId !== null) cancelAnimationFrame(rafId);
    };
  }, [enabled, isComplete, cursor, interval]);

  const completedRef = useRef(false);
  useEffect(() => {
    if (isComplete && !completedRef.current) {
      completedRef.current = true;
      onCompleteRef.current?.();
    } else if (!isComplete) {
      completedRef.current = false;
    }
  }, [isComplete]);

  const reset = useCallback(() => setSteps(0), []);

  const indexes = useMemo(
    () => Array.from({ length: count }, (_, i) => safeStart + i),
    [count, safeStart]
  );

  return { count, indexes, isComplete, reset };
}
