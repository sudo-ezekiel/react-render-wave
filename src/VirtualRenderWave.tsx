import React, {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useInsertionEffect,
  useLayoutEffect,
  useRef,
  useState,
  type FC,
  type ReactNode,
  type Ref,
} from "react";
import { HeightCache } from "./heightCache";
import { useRenderWave } from "./useRenderWave";
import type {
  HTMLTag,
  VirtualRenderWaveComponent,
  VirtualRenderWaveHandle,
  VirtualRenderWaveProps,
  WrapperProps,
} from "./types";

const FADE_ANIMATION = "rrw-fade-in";

// useLayoutEffect warns during server rendering, where there is no layout to
// read anyway.
const useIsomorphicLayoutEffect =
  typeof window !== "undefined" ? useLayoutEffect : useEffect;

let keyframesInjected = false;
function injectKeyframes(): void {
  if (keyframesInjected || typeof document === "undefined") return;
  const style = document.createElement("style");
  style.setAttribute("data-react-render-wave", "");
  style.textContent = `@keyframes ${FADE_ANIMATION} { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: none; } }`;
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

function renderElement(
  Component: HTMLTag | FC<WrapperProps>,
  props: WrapperProps
): ReactNode {
  if (typeof Component === "string") {
    const { children, ...rest } = props;
    return React.createElement(Component, rest, children);
  }
  return <Component {...props} />;
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
    className,
    style,
    renderItem,
    renderSkeleton,
    getItemKey,
    scrollToIndex,
    outerElement,
    innerElement,
    transition = false,
    snapToBatch = false,
    onEndReached,
    endReachedThreshold = 10,
    onScroll,
    keyboardNavigation = false,
    renderStickyHeader,
    groupByKey,
    ariaLabel,
  }: VirtualRenderWaveProps<T>,
  ref: Ref<VirtualRenderWaveHandle>
) {
  const outerRef = useRef<HTMLElement | null>(null);
  const innerRef = useRef<HTMLElement | null>(null);

  const cacheRef = useRef<HeightCache | null>(null);
  if (cacheRef.current === null) cacheRef.current = new HeightCache(itemHeight);
  const cache = cacheRef.current;
  cache.setDefaultSize(itemHeight);
  cache.setCount(items.length);

  const [, bumpHeightsVersion] = useState(0);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(containerHeight);

  // Handlers read the latest props through this ref so the scroll listener
  // only has to be attached once.
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

  // ---- dynamic height measurement -----------------------------------------

  const observerRef = useRef<ResizeObserver | null>(null);
  const elementToIndex = useRef(new Map<Element, number>());
  const indexToElement = useRef(new Map<number, HTMLElement>());
  const refCallbacks = useRef(new Map<number, (el: HTMLElement | null) => void>());

  const getObserver = useCallback(() => {
    if (observerRef.current) return observerRef.current;
    if (typeof ResizeObserver === "undefined") return null;
    observerRef.current = new ResizeObserver((entries) => {
      const heightCache = cacheRef.current;
      if (!heightCache) return;
      let changed = false;
      for (const entry of entries) {
        const index = elementToIndex.current.get(entry.target);
        if (index === undefined) continue;
        const height = (entry.target as HTMLElement).offsetHeight;
        if (height > 0 && heightCache.measure(index, height)) changed = true;
      }
      if (changed) bumpHeightsVersion((v) => v + 1);
    });
    return observerRef.current;
  }, []);

  useEffect(() => {
    return () => {
      observerRef.current?.disconnect();
      observerRef.current = null;
    };
  }, []);

  // Ref callbacks are cached per index so React does not detach and reattach
  // them on every render, which would rebuild the observer registrations.
  const getItemRef = (index: number) => {
    let cb = refCallbacks.current.get(index);
    if (!cb) {
      cb = (el: HTMLElement | null) => {
        const prev = indexToElement.current.get(index);
        if (el) {
          if (prev === el) return;
          if (prev) {
            observerRef.current?.unobserve(prev);
            elementToIndex.current.delete(prev);
          }
          indexToElement.current.set(index, el);
          elementToIndex.current.set(el, index);
          getObserver()?.observe(el);
        } else if (prev) {
          observerRef.current?.unobserve(prev);
          elementToIndex.current.delete(prev);
          indexToElement.current.delete(index);
        }
      };
      refCallbacks.current.set(index, cb);
    }
    return cb;
  };

  // ResizeObserver delivery is asynchronous, and it is missing entirely in
  // some environments. Measuring after every commit means offsets are right
  // before the browser paints rather than a frame later; the observer above
  // then only has to catch resizes that happen without a re-render, such as
  // an image finishing loading.
  useIsomorphicLayoutEffect(() => {
    const heightCache = cacheRef.current;
    if (!heightCache) return;
    let changed = false;
    for (const [index, el] of indexToElement.current) {
      const height = el.offsetHeight;
      if (height > 0 && heightCache.measure(index, height)) changed = true;
    }
    // measure() only reports true on an actual change, so this settles.
    if (changed) bumpHeightsVersion((v) => v + 1);
  });

  // ---- reveal -------------------------------------------------------------

  const { count: revealedCount } = useRenderWave({
    length: items.length,
    batchSize,
    interval,
    startIndex,
  });
  const safeStart = Math.max(0, Math.min(startIndex, items.length));
  const revealedEnd = Math.min(items.length, safeStart + revealedCount);

  // ---- windowing ----------------------------------------------------------

  const totalHeight = cache.totalSize();
  const firstVisible = cache.indexAt(scrollTop);
  const lastVisible = cache.indexAt(scrollTop + Math.max(0, viewportHeight - 1));
  const start = Math.max(0, firstVisible - overscan);
  const end = Math.min(items.length, lastVisible + 1 + overscan);

  // ---- scroll, snap, end detection ----------------------------------------

  const endReachedFiredRef = useRef(false);

  useEffect(() => {
    const el = outerRef.current;
    if (!el) return;

    let rafId: number | null = null;
    let snapTimer: ReturnType<typeof setTimeout> | null = null;

    const handleFrame = () => {
      rafId = null;
      const top = el.scrollTop;
      setScrollTop(top);
      latest.current.onScroll?.(top);

      const { onEndReached, endReachedThreshold } = latest.current;
      if (onEndReached) {
        const atEnd =
          top + el.clientHeight >= el.scrollHeight - endReachedThreshold;
        if (atEnd && !endReachedFiredRef.current) {
          endReachedFiredRef.current = true;
          onEndReached();
        } else if (!atEnd) {
          endReachedFiredRef.current = false;
        }
      }
    };

    const handleScroll = () => {
      if (rafId === null) rafId = requestAnimationFrame(handleFrame);

      if (latest.current.snapToBatch) {
        if (snapTimer) clearTimeout(snapTimer);
        snapTimer = setTimeout(() => {
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
        }, 150);
      }
    };

    el.addEventListener("scroll", handleScroll, { passive: true });
    setScrollTop(el.scrollTop);

    return () => {
      el.removeEventListener("scroll", handleScroll);
      if (snapTimer) clearTimeout(snapTimer);
      if (rafId !== null) cancelAnimationFrame(rafId);
    };
  }, []);

  useEffect(() => {
    const el = outerRef.current;
    if (!el) return;
    if (el.clientHeight > 0) setViewportHeight(el.clientHeight);
    if (typeof ResizeObserver === "undefined") return;
    const viewportObserver = new ResizeObserver(() => {
      setViewportHeight(el.clientHeight);
    });
    viewportObserver.observe(el);
    return () => viewportObserver.disconnect();
  }, []);

  // ---- keyboard navigation ------------------------------------------------

  const handleKeyDown = (e: React.KeyboardEvent<HTMLElement>) => {
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

  // ---- imperative handle --------------------------------------------------

  useImperativeHandle(
    ref,
    () => ({
      scrollTo: (index: number, behavior: ScrollBehavior = "smooth") => {
        outerRef.current?.scrollTo({ top: cache.offsetOf(index), behavior });
      },
      scrollToOffset: (px: number, behavior: ScrollBehavior = "smooth") => {
        outerRef.current?.scrollTo({ top: px, behavior });
      },
      getVisibleIndexes: () => {
        const visible: number[] = [];
        for (let i = start; i < end; i++) {
          if (i >= safeStart && i < revealedEnd) visible.push(i);
        }
        return visible;
      },
      getScrollElement: () => outerRef.current,
    }),
    [start, end, safeStart, revealedEnd, cache]
  );

  // ---- controlled scrollToIndex -------------------------------------------

  const lastScrollToIndexRef = useRef<number | undefined>(undefined);
  useEffect(() => {
    if (typeof scrollToIndex !== "number") {
      lastScrollToIndexRef.current = undefined;
      return;
    }
    if (scrollToIndex === lastScrollToIndexRef.current) return;
    lastScrollToIndexRef.current = scrollToIndex;
    outerRef.current?.scrollTo({ top: cache.offsetOf(scrollToIndex) });
  }, [scrollToIndex, cache]);

  // ---- render -------------------------------------------------------------

  let activeGroup: string | undefined;
  if (groupByKey && renderStickyHeader && items.length > 0) {
    const topIndex = Math.min(cache.indexAt(scrollTop), items.length - 1);
    activeGroup = getGroupLabel(items[topIndex], topIndex, groupByKey);
  }

  const children: ReactNode[] = [];
  for (let index = start; index < end; index++) {
    const revealed = index >= safeStart && index < revealedEnd;
    children.push(
      <div
        key={getItemKey ? getItemKey(items[index], index) : index}
        ref={getItemRef(index)}
        role="listitem"
        aria-setsize={items.length}
        aria-posinset={index + 1}
        style={{
          position: "absolute",
          top: cache.offsetOf(index),
          left: 0,
          right: 0,
          animation:
            transition && revealed
              ? `${FADE_ANIMATION} 0.3s ease backwards`
              : undefined,
        }}
      >
        {revealed
          ? renderItem(items[index], index)
          : renderSkeleton?.(index) ?? null}
      </div>
    );
  }

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
          // Positioning only. Give the header its own background, otherwise
          // rows scroll visibly behind it.
          <div style={{ position: "sticky", top: 0, zIndex: 1 }}>
            {renderStickyHeader(activeGroup)}
          </div>
        )}
        {renderElement(innerElement ?? "div", {
          ref: innerRef,
          role: "list",
          style: {
            position: "relative",
            height: totalHeight,
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
