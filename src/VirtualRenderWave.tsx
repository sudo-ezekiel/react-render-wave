"use client";

import React, {
  JSX,
  useEffect,
  useState,
  useImperativeHandle,
  forwardRef,
  useCallback,
  useLayoutEffect,
  useRef,
} from "react";
import { useRenderWave } from "./useRenderWave";
import { useVirtualScrollCore } from "./useVirtualScrollCore";

import {
  initWasm,
  getVisibleIndexesSafe,
  snapToOffsetSafe,
  computeScrollTargetSafe,
} from "./wasmBridge";

import {
  VirtualRenderWaveHandle,
  WrapperProps,
  HTMLTag,
  VirtualRenderWaveProps,
  GetItemType,
} from "./types";

function getGroupLabel<T>(
  item: any,
  groupByKey?: keyof GetItemType<T> | ((item: GetItemType<T>) => string)
): string | undefined {
  if (!groupByKey) return undefined;
  return typeof groupByKey === "function"
    ? groupByKey(item)
    : (item[groupByKey] as string);
}

function getCurrentGroup<T>(
  scrollTop: number,
  items: T[],
  itemHeights: Map<number, number>,
  fallbackHeight: number,
  groupByKey?: keyof GetItemType<T> | ((item: GetItemType<T>) => string)
): string | undefined {
  let offset = 0;
  for (let i = 0; i < items.length; i++) {
    const height = itemHeights.get(i) ?? fallbackHeight;
    if (offset + height > scrollTop) {
      return getGroupLabel(items[i], groupByKey);
    }
    offset += height;
  }
  return undefined;
}

function VirtualRenderWaveInner<T>(
  {
    items,
    itemHeight,
    containerHeight = 400,
    batchSize = 20,
    interval = 60,
    overscan = 5,
    startIndex = 0,
    className,
    style,
    renderItem,
    renderSkeleton,
    scrollToIndex,
    outerElement,
    innerElement,
    transition = false,
    snapToBatch = false,
    onEndReached,
    keyboardNavigation = false,
    renderStickyHeader,
    groupByKey,
  }: VirtualRenderWaveProps<T>,
  ref: React.Ref<VirtualRenderWaveHandle>
): JSX.Element {
  // Initialize WASM module on mount
  useEffect(() => {
    initWasm();
  }, []);

  const [itemHeights, setItemHeights] = useState<Map<number, number>>(
    new Map()
  );
  const itemRefs = useRef<Map<number, HTMLElement>>(new Map());

  const getOffsetForIndex = useCallback(
    (index: number) => {
      let offset = 0;
      for (let i = 0; i < index; i++) {
        offset += itemHeights.get(i) ?? itemHeight;
      }
      return offset;
    },
    [itemHeights, itemHeight]
  );

  const getTotalHeight = useCallback(() => {
    let total = 0;
    for (let i = 0; i < items.length; i++) {
      total += itemHeights.get(i) ?? itemHeight;
    }
    return total;
  }, [itemHeights, items.length, itemHeight]);

  useLayoutEffect(() => {
    const newHeights = new Map<number, number>();
    let hasChanges = false;

    for (const [i, el] of itemRefs.current.entries()) {
      const measured = el.offsetHeight;
      const prev = itemHeights.get(i);
      if (prev !== measured) {
        hasChanges = true;
        newHeights.set(i, measured);
      } else {
        newHeights.set(i, prev!);
      }
    }

    if (hasChanges) {
      setItemHeights(newHeights);
    }
  }, [items]);

  const { outerContainerRef, innerContainerRef, scrollToOffset, scrollToItem } =
    useVirtualScrollCore<HTMLDivElement, HTMLDivElement>({
      itemCount: items.length,
      itemSize: itemHeight,
      preRenderedItemCount: 0,
    });

  const revealedIndexes = useRenderWave({
    length: items.length,
    batchSize,
    interval,
    startIndex,
  });

  const [scrollTop, setScrollTop] = useState(0);
  const [containerClientHeight, setContainerClientHeight] =
    useState(containerHeight);

  const findStartIndex = (): number => {
    let offset = 0;
    for (let i = 0; i < items.length; i++) {
      const height = itemHeights.get(i) ?? itemHeight;
      if (offset + height > scrollTop) return Math.max(0, i - overscan);
      offset += height;
    }
    return 0;
  };

  const findEndIndex = (): number => {
    let offset = 0;
    for (let i = 0; i < items.length; i++) {
      const height = itemHeights.get(i) ?? itemHeight;
      offset += height;
      if (offset > scrollTop + containerClientHeight)
        return Math.min(items.length, i + overscan);
    }
    return items.length;
  };

  const start = findStartIndex();
  const end = findEndIndex();

  useImperativeHandle(ref, () => ({
    scrollTo: (index: number) => {
      const offset = getOffsetForIndex(index);
      outerContainerRef.current?.scrollTo({ top: offset, behavior: "smooth" });
    },
    scrollToOffset: (offset: number) => {
      outerContainerRef.current?.scrollTo({ top: offset, behavior: "smooth" });
    },
    getVisibleIndexes: () => getVisibleIndexesSafe(start, end, revealedIndexes),
  }));

  // TODO: REFACTOR FOR DEV READABILITY
  useEffect(() => {
    const el = outerContainerRef.current;
    if (!el) return;

    let snapTimeout: NodeJS.Timeout | null = null;
    let rafId: number | null = null;

    const handleScroll = () => {
      if (rafId !== null) cancelAnimationFrame(rafId);

      rafId = requestAnimationFrame(() => {
        setScrollTop(el.scrollTop);

        // Snap to nearest batch after scrolling stops
        if (snapToBatch) {
          if (snapTimeout) clearTimeout(snapTimeout);
          snapTimeout = setTimeout(() => {
            const targetOffset = snapToOffsetSafe(
              el.scrollTop,
              itemHeight,
              batchSize
            );
            el.scrollTo({ top: targetOffset, behavior: "smooth" });
          }, 150);
        }

        // Trigger end-of-list callback
        if (onEndReached) {
          const reachedBottom =
            el.scrollTop + el.clientHeight >= el.scrollHeight - 10;
          if (reachedBottom) {
            onEndReached();
          }
        }
      });
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (!keyboardNavigation) return;

      const el = outerContainerRef.current;
      if (!el || !el.contains(document.activeElement)) return;

      const maxScroll = el.scrollHeight - el.clientHeight;

      const offset = computeScrollTargetSafe(
        e.key,
        el.scrollTop,
        el.clientHeight,
        itemHeight,
        maxScroll
      );

      el.scrollTo({ top: offset, behavior: "smooth" });
    };

    const resizeObserver = new ResizeObserver(() => {
      setContainerClientHeight(el.clientHeight);
    });

    el.addEventListener("scroll", handleScroll);
    if (keyboardNavigation) window.addEventListener("keydown", handleKeyDown);
    resizeObserver.observe(el);

    // Initial values
    setScrollTop(el.scrollTop);
    setContainerClientHeight(el.clientHeight);

    return () => {
      el.removeEventListener("scroll", handleScroll);
      if (keyboardNavigation) {
        window.removeEventListener("keydown", handleKeyDown);
      }
      resizeObserver.disconnect();
      if (snapTimeout) clearTimeout(snapTimeout);
      if (rafId !== null) cancelAnimationFrame(rafId);
    };
  }, [
    outerContainerRef,
    snapToBatch,
    itemHeight,
    batchSize,
    onEndReached,
    keyboardNavigation,
  ]);

  useEffect(() => {
    if (
      typeof scrollToIndex === "number" &&
      outerContainerRef.current &&
      revealedIndexes.includes(scrollToIndex)
    ) {
      const offset = getOffsetForIndex(scrollToIndex);
      outerContainerRef.current.scrollTo({ top: offset });
    }
  }, [scrollToIndex, itemHeights, revealedIndexes]);

  const activeGroup = getCurrentGroup(
    scrollTop,
    items,
    itemHeights,
    itemHeight,
    groupByKey
  );

  const visibleItems = Array.from({ length: end - start }, (_, i) => {
    const index = start + i;
    const isRevealed = revealedIndexes.includes(index);

    return (
      <div
        key={index}
        ref={(el) => {
          if (el) itemRefs.current.set(index, el);
        }}
        role="listitem"
        style={{
          position: "absolute",
          top: getOffsetForIndex(index),
          left: 0,
          right: 0,
          opacity: transition ? 0 : undefined,
          animation:
            transition && isRevealed ? "fadeIn 0.3s ease forwards" : undefined,
        }}
      >
        {isRevealed
          ? renderItem(items[index], index)
          : renderSkeleton?.(index) ?? null}
      </div>
    );
  });

  const renderElement = (
    Component: HTMLTag | React.FC<WrapperProps>,
    props: WrapperProps
  ) => {
    if (typeof Component === "string") {
      return React.createElement(Component, {
        ref: props.ref,
        role: "list",
        style: props.style,
        className: props.className,
        children: props.children,
        tabIndex: keyboardNavigation ? 0 : undefined,
      });
    }
    return <Component {...props} />;
  };

  return (
    <>
      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: none; }
        }
      `}</style>
      {renderElement(outerElement || "div", {
        ref: outerContainerRef,
        className,
        style: {
          position: "relative",
          overflowY: "auto",
          height: containerHeight,
          ...style,
        },
        children: (
          <>
            {renderStickyHeader && activeGroup && (
              <div
                style={{
                  position: "sticky",
                  top: 0,
                  zIndex: 1,
                  background: "white",
                  borderBottom: "1px solid #ddd",
                }}
              >
                {renderStickyHeader(activeGroup)}
              </div>
            )}
            {renderElement(innerElement || "div", {
              ref: innerContainerRef,
              style: {
                position: "relative",
                height: getTotalHeight(),
                width: "100%",
              },
              children: visibleItems,
            })}
          </>
        ),
      })}
    </>
  );
}

const ForwardedVirtualRenderWave = forwardRef(VirtualRenderWaveInner) as <T>(
  props: VirtualRenderWaveProps<T> & {
    ref?: React.Ref<VirtualRenderWaveHandle>;
  }
) => JSX.Element;

export { ForwardedVirtualRenderWave as VirtualRenderWave };
