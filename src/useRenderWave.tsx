import React, { useEffect, useState, useRef, useCallback } from "react";

// ----------------------
// useRenderWave Hook
// ----------------------

interface UseRenderWaveOptions {
  length: number;
  batchSize?: number;
  interval?: number;
  startIndex?: number;
}

export function useRenderWave({
  length,
  batchSize = 20,
  interval = 50,
  startIndex = 0,
}: UseRenderWaveOptions): number[] {
  const [count, setCount] = useState(startIndex);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    const tick = () => {
      setCount((prev) => {
        const next = Math.min(prev + batchSize, length);
        if (next < length) {
          timerRef.current = setTimeout(() => {
            rafRef.current = requestAnimationFrame(tick);
          }, interval);
        }
        return next;
      });
    };

    tick();

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [length, batchSize, interval]);

  return Array.from({ length: count - startIndex }, (_, i) => i + startIndex);
}

// ----------------------
// RenderWave Component
// ----------------------

interface RenderWaveProps<T> {
  items: T[];
  batchSize?: number;
  interval?: number;
  startIndex?: number;
  renderItem: (item: T, index: number) => React.ReactNode;
}

export function RenderWave<T>({
  items,
  batchSize,
  interval,
  startIndex,
  renderItem,
}: RenderWaveProps<T>) {
  const indexes = useRenderWave({
    length: items.length,
    batchSize,
    interval,
    startIndex,
  });

  return <>{indexes.map((i) => renderItem(items[i], i))}</>;
}

// ----------------------
// useVirtualScrollCore Hook (Experimental)
// ----------------------

interface VirtualScrollOptions {
  itemCount: number;
  itemSize?: number;
  horizontal?: boolean;
  preRenderedItemCount?: number;
}

interface VirtualScrollReturn<
  O extends HTMLElement = HTMLElement,
  I extends HTMLElement = O
> {
  outerContainerRef: React.RefObject<O | null>;
  innerContainerRef: React.RefObject<I | null>;
  scrollToOffset: (offset: number) => void;
  scrollToItem: (index: number) => void;
}

export function useVirtualScrollCore<
  O extends HTMLElement = HTMLElement,
  I extends HTMLElement = O
>({
  itemCount,
  itemSize = 45,
  horizontal = false,
  preRenderedItemCount = 0,
}: VirtualScrollOptions): VirtualScrollReturn<O, I> {
  const outerContainerRef = useRef<O>(null);
  const innerContainerRef = useRef<I>(null);

  const scrollKey = horizontal ? "scrollLeft" : "scrollTop";

  useEffect(() => {
    if (innerContainerRef.current) {
      if (horizontal) {
        innerContainerRef.current.style.width = `${itemCount * itemSize}px`;
      } else {
        innerContainerRef.current.style.height = `${itemCount * itemSize}px`;
      }
    }
  }, [itemCount, itemSize, horizontal]);

  const scrollToOffset = useCallback(
    (offset: number) => {
      if (outerContainerRef.current) {
        outerContainerRef.current[scrollKey] = offset;
      }
    },
    [scrollKey]
  );

  const scrollToItem = useCallback(
    (index: number) => {
      const offset = index * itemSize;
      scrollToOffset(offset);
    },
    [itemSize, scrollToOffset]
  );

  return {
    outerContainerRef,
    innerContainerRef,
    scrollToOffset,
    scrollToItem,
  };
}
