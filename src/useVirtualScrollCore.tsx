import React, { useEffect, useRef, useCallback } from "react";

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
