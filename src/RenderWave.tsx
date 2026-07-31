import type { ReactNode } from "react";
import { useRenderWave } from "./useRenderWave";

export interface RenderWaveProps<T> {
  items: T[];
  /** Items revealed per wave. Default 20. */
  batchSize?: number;
  /** Delay in milliseconds between waves. Default 50. */
  interval?: number;
  /** Index of the first item to reveal. Default 0. */
  startIndex?: number;
  /** Set to false to pause the reveal. Default true. */
  enabled?: boolean;
  /** Called once each time the reveal reaches the end of the list. */
  onComplete?: () => void;
  /** Render one item. Set a key on the returned element. */
  renderItem: (item: T, index: number) => ReactNode;
}

/** Renders a list progressively in timed batches. */
export function RenderWave<T>({
  items,
  batchSize,
  interval,
  startIndex,
  enabled,
  onComplete,
  renderItem,
}: RenderWaveProps<T>) {
  const { indexes } = useRenderWave({
    length: items.length,
    batchSize,
    interval,
    startIndex,
    enabled,
    onComplete,
  });

  return <>{indexes.map((i) => renderItem(items[i], i))}</>;
}
