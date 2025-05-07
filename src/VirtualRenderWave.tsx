"use client";

import React, {
  JSX,
  useEffect,
  useState,
  useImperativeHandle,
  forwardRef,
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
} from "./types";

function getGroupLabel<T>(
  item: T,
  groupByKey?: keyof T | ((item: T) => string)
): string | undefined {
  if (!groupByKey) return undefined;
  return typeof groupByKey === "function"
    ? groupByKey(item)
    : (item[groupByKey] as string);
}

function getCurrentGroup<T>(
  scrollTop: number,
  itemHeight: number,
  items: T[],
  groupByKey?: keyof T | ((item: T) => string)
): string | undefined {
  const currentIndex = Math.floor(scrollTop / itemHeight);
  return getGroupLabel(items[currentIndex], groupByKey);
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

  const start = Math.max(0, Math.floor(scrollTop / itemHeight) - overscan);
  const end = Math.min(
    items.length,
    Math.ceil((scrollTop + containerClientHeight) / itemHeight) + overscan
  );

  useImperativeHandle(ref, () => ({
    scrollTo: (index: number) => {
      const offset = index * itemHeight;
      outerContainerRef.current?.scrollTo({ top: offset, behavior: "smooth" });
    },
    scrollToOffset: (offset: number) => {
      outerContainerRef.current?.scrollTo({ top: offset, behavior: "smooth" });
    },
    getVisibleIndexes: () => getVisibleIndexesSafe(start, end, revealedIndexes),
  }));

  useEffect(() => {
    const el = outerContainerRef.current;
    if (!el) return;

    let snapTimeout: NodeJS.Timeout | null = null;

    const handleScroll = () => {
      setScrollTop(el.scrollTop);

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

      if (onEndReached) {
        const reachedBottom =
          el.scrollTop + el.clientHeight >= el.scrollHeight - 10;
        if (reachedBottom) {
          onEndReached();
        }
      }
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

    setScrollTop(el.scrollTop);
    setContainerClientHeight(el.clientHeight);

    return () => {
      el.removeEventListener("scroll", handleScroll);
      if (keyboardNavigation)
        window.removeEventListener("keydown", handleKeyDown);
      resizeObserver.disconnect();
      if (snapTimeout) clearTimeout(snapTimeout);
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
    if (typeof scrollToIndex === "number" && outerContainerRef.current) {
      const offset = scrollToIndex * itemHeight;
      outerContainerRef.current.scrollTo({ top: offset });
    }
  }, [scrollToIndex, itemHeight]);

  const activeGroup = getCurrentGroup(scrollTop, itemHeight, items, groupByKey);

  const visibleItems = Array.from({ length: end - start }, (_, i) => {
    const index = start + i;
    const isRevealed = revealedIndexes.includes(index);

    return (
      <div
        key={index}
        role="listitem"
        style={{
          position: "absolute",
          top: index * itemHeight,
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
                height: items.length * itemHeight,
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
