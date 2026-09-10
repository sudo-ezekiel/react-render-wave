import React, {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useInsertionEffect,
  useMemo,
  useRef,
  type ReactNode,
  type Ref,
} from "react";
import { useRenderWave } from "./useRenderWave";
import { useViewportReveal } from "./useViewportReveal";
import { useVirtualWindow } from "./useVirtualWindow";
import type { ScrollToIndexOptions } from "./useVirtualWindow";
import type {
  HTMLTag,
  VirtualRenderWaveComponent,
  VirtualRenderWaveHandle,
  VirtualRenderWaveProps,
  WrapperComponent,
  WrapperProps,
} from "./types";

const FADE_ANIMATION = "rrw-fade-in";

/** Quiet period after a scroll before snapToBatch aligns the container. */
const SNAP_DELAY_MS = 150;

let keyframesInjected = false;
function injectKeyframes(): void {
  if (keyframesInjected || typeof document === "undefined") return;
  const style = document.createElement("style");
  style.setAttribute("data-react-render-wave", "");
  // Scoped to no-preference so reduced motion needs no JS listener.
  style.textContent = `@media (prefers-reduced-motion: no-preference) { @keyframes ${FADE_ANIMATION} { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: none; } } }`;
  document.head.appendChild(style);
  keyframesInjected = true;
}

function getGroupLabel<T>(
  item: T,
  index: number,
  groupByKey: keyof T | ((item: T, index: number) => string)
): string | undefined {
  if (typeof groupByKey === "function") return groupByKey(item, index);
  const value = item?.[groupByKey];
  return value == null ? undefined : String(value);
}

// createElement, not JSX, so `ref` travels as an ordinary prop on React 18 and 19 alike.
function renderElement(
  Component: HTMLTag | WrapperComponent,
  props: WrapperProps
): ReactNode {
  if (typeof Component === "string") {
    const { children, ...rest } = props;
    return React.createElement(Component, rest, children);
  }
  // The cast keeps one source tree compiling against @types/react 18 and 19.
  const Fn = Component as (props: WrapperProps) => ReactNode;
  return React.createElement(Fn, props);
}

function VirtualRenderWaveInner<T>(
  {
    items,
    itemHeight,
    containerHeight = 400,
    batchSize = 20,
    interval = 50,
    overscan = 5,
    startIndex = 0,
    revealMode = "sequential",
    className,
    style,
    renderItem,
    renderSkeleton,
    getItemKey,
    scrollToIndex,
    initialScrollOffset,
    initialScrollIndex,
    outerElement,
    innerElement,
    transition = false,
    snapToBatch = false,
    onEndReached,
    endReachedThreshold = 10,
    onScroll,
    onRangeChange,
    keyboardNavigation = false,
    renderStickyHeader,
    groupByKey,
    ariaLabel,
  }: VirtualRenderWaveProps<T>,
  ref: Ref<VirtualRenderWaveHandle>
) {
  const outerRef = useRef<HTMLElement | null>(null);
  const innerRef = useRef<HTMLElement | null>(null);

  const latest = useRef({
    snapToBatch,
    itemHeight,
    batchSize,
    onEndReached,
    endReachedThreshold,
    onScroll,
  });
  useEffect(() => {
    latest.current = {
      snapToBatch,
      itemHeight,
      batchSize,
      onEndReached,
      endReachedThreshold,
      onScroll,
    };
  });

  useInsertionEffect(() => {
    if (transition) injectKeyframes();
  }, [transition]);

  const keyFnRef = useRef(getItemKey);
  keyFnRef.current = getItemKey;

  const keyed = getItemKey !== undefined;
  const keyFn = useMemo(
    () =>
      keyed
        ? (index: number) => keyFnRef.current!(items[index], index)
        : undefined,
    [items, keyed]
  );

  const endReachedFiredRef = useRef(false);
  const snapTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const checkEndReached = useCallback((el: HTMLElement | null) => {
    if (!el) return;
    const { onEndReached, endReachedThreshold } = latest.current;
    if (!onEndReached) return;
    const atEnd =
      el.scrollTop + el.clientHeight >= el.scrollHeight - endReachedThreshold;
    if (atEnd && !endReachedFiredRef.current) {
      endReachedFiredRef.current = true;
      onEndReached();
    } else if (!atEnd) {
      endReachedFiredRef.current = false;
    }
  }, []);

  const handleScroll = useCallback(
    (offset: number) => {
      latest.current.onScroll?.(offset);
      checkEndReached(outerRef.current);

      if (!latest.current.snapToBatch) return;
      if (snapTimerRef.current) clearTimeout(snapTimerRef.current);
      snapTimerRef.current = setTimeout(() => {
        snapTimerRef.current = null;
        const el = outerRef.current;
        if (!el) return;
        const { itemHeight, batchSize } = latest.current;
        const batchPx = itemHeight * Math.max(1, batchSize);
        if (batchPx <= 0) return;
        const maxScroll = Math.max(0, el.scrollHeight - el.clientHeight);
        const target = Math.min(
          Math.round(el.scrollTop / batchPx) * batchPx,
          maxScroll
        );
        if (Math.abs(target - el.scrollTop) > 1) {
          el.scrollTo({ top: target, behavior: "smooth" });
        }
      }, SNAP_DELAY_MS);
    },
    [checkEndReached]
  );

  useEffect(() => {
    return () => {
      if (snapTimerRef.current) clearTimeout(snapTimerRef.current);
    };
  }, []);

  const getScrollElement = useCallback(() => outerRef.current, []);

  const hook = useVirtualWindow({
    count: items.length,
    estimateSize: itemHeight,
    overscan,
    initialViewportSize: containerHeight,
    getItemKey: keyFn,
    getScrollElement,
    initialScrollOffset,
    initialScrollIndex: initialScrollIndex ?? scrollToIndex,
    onScroll: handleScroll,
    onRangeChange,
  });

  const sequential = revealMode !== "viewport";

  const { count: revealedCount } = useRenderWave({
    length: items.length,
    batchSize,
    interval,
    startIndex,
    enabled: sequential,
  });
  const safeStart = Math.max(0, Math.min(startIndex, items.length));
  const revealedEnd = Math.min(items.length, safeStart + revealedCount);

  const viewportReveal = useViewportReveal({
    count: items.length,
    start: hook.start,
    end: hook.end,
    batchSize,
    interval,
    startIndex,
    enabled: !sequential,
    getItemKey: keyFn,
  });

  const isRevealed = sequential
    ? (index: number) => index >= safeStart && index < revealedEnd
    : viewportReveal.isRevealed;

  const prevItemsLength = useRef(items.length);
  useEffect(() => {
    if (prevItemsLength.current !== items.length) {
      prevItemsLength.current = items.length;
      endReachedFiredRef.current = false;
    }
    checkEndReached(outerRef.current);
  }, [items.length, hook.viewportSize, hook.totalSize, checkEndReached]);

  const refWarnedRef = useRef(false);
  useEffect(() => {
    if (refWarnedRef.current) return;
    refWarnedRef.current = true;
    if (outerElement && typeof outerElement !== "string" && !outerRef.current) {
      console.error(
        "react-render-wave: outerElement did not attach the ref it received, so the list cannot scroll or measure. On React 18 wrap the component in forwardRef and pass the ref to your DOM node."
      );
    }
    if (innerElement && typeof innerElement !== "string" && !innerRef.current) {
      console.error(
        "react-render-wave: innerElement did not attach the ref it received, so the list cannot scroll or measure. On React 18 wrap the component in forwardRef and pass the ref to your DOM node."
      );
    }
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLElement>) => {
    if (e.target !== e.currentTarget) return;
    const el = outerRef.current;
    if (!el) return;
    const maxScroll = Math.max(0, el.scrollHeight - el.clientHeight);
    let target: number;
    switch (e.key) {
      case "ArrowDown":
        target = Math.min(el.scrollTop + itemHeight, maxScroll);
        break;
      case "ArrowUp":
        target = Math.max(el.scrollTop - itemHeight, 0);
        break;
      case "PageDown":
        target = Math.min(el.scrollTop + el.clientHeight, maxScroll);
        break;
      case "PageUp":
        target = Math.max(el.scrollTop - el.clientHeight, 0);
        break;
      case "Home":
        target = 0;
        break;
      case "End":
        target = maxScroll;
        break;
      default:
        return;
    }
    e.preventDefault();
    el.scrollTo({ top: target, behavior: "smooth" });
  };

  const { start, end } = hook;
  const scrollIndex = hook.scrollToIndex;
  const scrollToOffset = hook.scrollToOffset;
  const getEl = hook.getScrollElement;

  useImperativeHandle(
    ref,
    () => ({
      scrollTo: (
        index: number,
        options?: ScrollBehavior | ScrollToIndexOptions
      ) => {
        scrollIndex(index, {
          align: "start",
          behavior: "smooth",
          ...(typeof options === "string" ? { behavior: options } : options),
        });
      },
      scrollToOffset: (px: number, behavior: ScrollBehavior = "smooth") => {
        scrollToOffset(px, { behavior });
      },
      getVisibleIndexes: () => {
        const visible: number[] = [];
        for (let i = start; i < end; i++) {
          if (isRevealed(i)) visible.push(i);
        }
        return visible;
      },
      getScrollElement: () => getEl(),
    }),
    [
      start,
      end,
      sequential,
      safeStart,
      revealedEnd,
      viewportReveal.isRevealed,
      scrollIndex,
      scrollToOffset,
      getEl,
    ]
  );

  const lastScrollToIndexRef = useRef<number | undefined>(scrollToIndex);
  useEffect(() => {
    if (typeof scrollToIndex !== "number") {
      lastScrollToIndexRef.current = undefined;
      return;
    }
    if (scrollToIndex === lastScrollToIndexRef.current) return;
    lastScrollToIndexRef.current = scrollToIndex;
    scrollIndex(scrollToIndex, { behavior: "auto" });
  }, [scrollToIndex, scrollIndex]);

  let activeGroup: string | undefined;
  if (groupByKey && renderStickyHeader && items.length > 0) {
    const topIndex = Math.min(hook.visibleStart, items.length - 1);
    activeGroup = getGroupLabel(items[topIndex], topIndex, groupByKey);
  }

  const children: ReactNode[] = hook.virtualItems.map((item) => {
    const revealed = isRevealed(item.index);
    return (
      <div
        key={item.key}
        ref={hook.measureRef(item.index)}
        role="listitem"
        aria-setsize={items.length}
        aria-posinset={item.index + 1}
        style={{
          position: "absolute",
          top: item.offset,
          left: 0,
          right: 0,
          animation:
            transition && revealed
              ? `${FADE_ANIMATION} 0.3s ease backwards`
              : undefined,
        }}
      >
        {revealed
          ? renderItem(items[item.index], item.index)
          : (renderSkeleton?.(item.index) ?? null)}
      </div>
    );
  });

  return renderElement(outerElement ?? "div", {
    ref: outerRef,
    className,
    style: {
      position: "relative",
      overflowY: "auto",
      height: containerHeight,
      ...style,
    },
    tabIndex: keyboardNavigation ? 0 : undefined,
    onKeyDown: keyboardNavigation ? handleKeyDown : undefined,
    "aria-label": ariaLabel,
    children: (
      <>
        {renderStickyHeader && activeGroup !== undefined && (
          <div style={{ position: "sticky", top: 0, zIndex: 1 }}>
            {renderStickyHeader(activeGroup)}
          </div>
        )}
        {renderElement(innerElement ?? "div", {
          ref: innerRef,
          role: "list",
          style: {
            position: "relative",
            height: hook.totalSize,
            width: "100%",
          },
          children,
        })}
      </>
    ),
  });
}

/**
 * Virtualized list that reveals items in timed waves. Only the visible window
 * (plus overscan) is mounted; offsets come from a prefix-sum cache with
 * binary search, so lookups stay fast for very large lists.
 */
export const VirtualRenderWave = forwardRef(
  VirtualRenderWaveInner as (
    props: VirtualRenderWaveProps<unknown>,
    ref: Ref<VirtualRenderWaveHandle>
  ) => ReactNode
) as VirtualRenderWaveComponent;
