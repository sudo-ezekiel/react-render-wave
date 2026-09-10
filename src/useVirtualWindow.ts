import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { SizeCache } from "./sizeCache";
import type { ItemKey } from "./sizeCache";

export type { ItemKey };

/** Where the item lands in the viewport. "auto" only scrolls if it has to. */
export type ScrollAlign = "start" | "center" | "end" | "auto";

export interface ScrollToIndexOptions {
  /** Default "start". */
  align?: ScrollAlign;
  /** Default "auto", which scrolls instantly. */
  behavior?: ScrollBehavior;
}

export interface ScrollToOffsetOptions {
  /** Default "auto", which scrolls instantly. */
  behavior?: ScrollBehavior;
}

export interface VirtualItem {
  index: number;
  /** getItemKey(index) when supplied, otherwise the index. */
  key: ItemKey;
  /** Pixel offset of the top of the item within the sizer. */
  offset: number;
  /** Measured size, or the estimate until the item has been measured. */
  size: number;
}

export interface VirtualRange {
  /** First rendered index. */
  start: number;
  /** One past the last rendered index (exclusive). */
  end: number;
  /** First index intersecting the viewport. */
  visibleStart: number;
  /** One past the last index intersecting the viewport (exclusive). */
  visibleEnd: number;
}

export interface UseVirtualWindowOptions {
  /** Number of items in the list. */
  count: number;
  /**
   * Size in pixels used for an item until it has been measured. A value that
   * is not positive and finite falls back to 1, which keeps the list windowed.
   */
  estimateSize: number;
  /**
   * Extra items rendered above and below the viewport. Default 5. Clamped to a
   * non-negative whole number.
   */
  overscan?: number;
  /**
   * Stable identity per index. Measurements are stored by key, so a reorder of
   * the data carries each measured size with its item. A change of function
   * identity is read as a reorder and forces one O(count) offset rebuild, so
   * memoize it on the data rather than passing a fresh arrow every render.
   */
  getItemKey?: (index: number) => ItemKey;
  /**
   * Supply the scroll container from a ref you already own. An alternative to
   * putting the returned scrollRef on the element.
   */
  getScrollElement?: () => HTMLElement | null;
  /** Scroll offset for the first render. Default 0. Read once. */
  initialScrollOffset?: number;
  /** Index to open at. Wins over initialScrollOffset. Read once. */
  initialScrollIndex?: number;
  /** Viewport size used until the container is measured. Default 400. Read once. */
  initialViewportSize?: number;
  /**
   * Pixels between the scroll container's content origin and item 0, for an
   * in-flow header, caption or toolbar above the sizer. Default 0.
   */
  scrollMargin?: number;
  /**
   * How an item element is measured. Default `el => el.offsetHeight`. Use
   * `el => el.getBoundingClientRect().height` for fractional row heights, such
   * as table rows with border collapsing.
   */
  measureSize?: (el: HTMLElement) => number;
  /**
   * Called with the current scroll offset, at most once per animation frame.
   * Programmatic scrolls and measurement corrections report through it too. It
   * is not called when the container is first attached.
   */
  onScroll?: (offset: number) => void;
  /** Called whenever any of the four range bounds changes. */
  onRangeChange?: (range: VirtualRange) => void;
}

export interface UseVirtualWindowResult {
  /** Ref callback for the scroll container. */
  scrollRef: (el: HTMLElement | null) => void;
  /** Ref callback for the item element at an index. Stable per index. */
  measureRef: (index: number) => (el: HTMLElement | null) => void;
  /** The items to render, from start up to end. */
  virtualItems: VirtualItem[];
  /** First rendered index. */
  start: number;
  /** One past the last rendered index (exclusive). */
  end: number;
  /** First index intersecting the viewport. */
  visibleStart: number;
  /** One past the last index intersecting the viewport (exclusive). */
  visibleEnd: number;
  /** Size of all items together, for the sizer element. */
  totalSize: number;
  /** Current scroll offset of the container. */
  scrollOffset: number;
  /** Current size of the viewport. */
  viewportSize: number;
  /** Pixel offset of the top of an item. */
  offsetOf(index: number): number;
  /** Measured size of an item, or the estimate. */
  sizeOf(index: number): number;
  /** Index of the item whose span contains a pixel offset. */
  indexAt(offset: number): number;
  /**
   * Scroll so the item is aligned in the viewport. Out of range indexes clamp
   * to the list; NaN is ignored.
   */
  scrollToIndex(index: number, options?: ScrollToIndexOptions): void;
  /** Scroll to a pixel offset. NaN is ignored. */
  scrollToOffset(offset: number, options?: ScrollToOffsetOptions): void;
  /** The scroll container, or null before it is attached. */
  getScrollElement(): HTMLElement | null;
}

/** A scroll we issued and still have to keep on target as items are measured. */
interface ScrollTarget {
  index: number;
  align: "start" | "center" | "end";
  behavior: ScrollBehavior;
  /** Offset the container was sent to, as the container reported it back. */
  issuedOffset: number;
  attempts: number;
  /** Commits that moved nothing while the container sat on the target. */
  quietPasses: number;
  /** False while the target is waiting for a container to be attached. */
  issued: boolean;
}

/** Corrections give up after this many re-issues, so measurement cannot loop. */
const MAX_CORRECTION_ATTEMPTS = 5;
/** Quiet commits before a target counts as settled. */
const SETTLED_QUIET_PASSES = 2;
/** Quiet period that counts as the end of a smooth scroll. */
const SMOOTH_SETTLE_MS = 150;

const useIsomorphicLayoutEffect =
  typeof window !== "undefined" ? useLayoutEffect : useEffect;

const getScrollOffset = (el: HTMLElement): number => el.scrollTop;
const getViewportSize = (el: HTMLElement): number => el.clientHeight;
const defaultMeasure = (el: HTMLElement): number => el.offsetHeight;

/**
 * Headless windowing: which items to render, where to put them, and how to
 * scroll to one. It renders nothing and owns no styles.
 *
 * Put `scrollRef` on a scroll container with a constrained height and
 * `overflow: auto`, give the element inside it a height of `totalSize`, and
 * position each `virtualItems` entry at its `offset`. Item elements take
 * `measureRef(index)`, which measures them and keeps the offsets honest as
 * they turn out taller or shorter than the estimate.
 *
 * The first render is derived only from `count`, `estimateSize`, `overscan`,
 * `scrollMargin`, `getItemKey` and the `initial*` options, so server markup and
 * the first client render agree.
 */
export function useVirtualWindow({
  count,
  estimateSize: estimateSizeOption,
  overscan: overscanOption = 5,
  getItemKey,
  getScrollElement: getScrollElementOption,
  initialScrollOffset,
  initialScrollIndex,
  initialViewportSize,
  scrollMargin = 0,
  measureSize,
  onScroll,
  onRangeChange,
}: UseVirtualWindowOptions): UseVirtualWindowResult {
  const estimateSize =
    Number.isFinite(estimateSizeOption) && estimateSizeOption > 0
      ? estimateSizeOption
      : 1;
  const overscan = Number.isFinite(overscanOption)
    ? Math.max(0, Math.floor(overscanOption))
    : 0;

  const cacheRef = useRef<SizeCache | null>(null);
  if (cacheRef.current === null) cacheRef.current = new SizeCache(estimateSize);
  const cache = cacheRef.current;
  cache.setDefaultSize(estimateSize);
  cache.setCount(count);
  cache.setKeyFn(getItemKey);

  const initialRef = useRef({
    initialScrollOffset,
    initialScrollIndex,
    initialViewportSize,
  });

  const [scrollOffset, setScrollOffset] = useState(() =>
    initialScrollIndex !== undefined && !Number.isNaN(initialScrollIndex)
      ? Math.min(Math.max(0, initialScrollIndex), count) * estimateSize +
        scrollMargin
      : Number.isFinite(initialScrollOffset)
        ? Math.max(0, initialScrollOffset as number)
        : 0
  );
  const [viewportSize, setViewportSize] = useState(
    () => initialViewportSize ?? 400
  );
  const [scrollEl, setScrollEl] = useState<HTMLElement | null>(null);
  const [heightsVersion, bumpHeightsVersion] = useState(0);

  const latest = useRef({
    onScroll,
    onRangeChange,
    getItemKey,
    getScrollElement: getScrollElementOption,
    estimateSize,
    overscan,
    count,
    scrollMargin,
    measureSize,
  });
  const scrollOffsetRef = useRef(scrollOffset);
  const viewportSizeRef = useRef(viewportSize);
  useIsomorphicLayoutEffect(() => {
    latest.current = {
      onScroll,
      onRangeChange,
      getItemKey,
      getScrollElement: getScrollElementOption,
      estimateSize,
      overscan,
      count,
      scrollMargin,
      measureSize,
    };
    scrollOffsetRef.current = scrollOffset;
    viewportSizeRef.current = viewportSize;
  });

  const scrollElRef = useRef<HTMLElement | null>(null);
  const scrollRef = useCallback((el: HTMLElement | null) => {
    scrollElRef.current = el;
    setScrollEl(el);
  }, []);

  useIsomorphicLayoutEffect(() => {
    const get = latest.current.getScrollElement;
    if (!get) return;
    const el = get();
    if (el === scrollElRef.current) return;
    scrollElRef.current = el;
    setScrollEl(el);
  });

  const observerRef = useRef<ResizeObserver | null>(null);
  const observedChangeRef = useRef(false);
  const elementToIndex = useRef(new Map<Element, number>());
  const elementToKey = useRef(new Map<Element, ItemKey>());
  const indexToElement = useRef(new Map<number, HTMLElement>());
  const refCallbacks = useRef(
    new Map<number, (el: HTMLElement | null) => void>()
  );

  const readSize = useCallback(
    (el: HTMLElement) => (latest.current.measureSize ?? defaultMeasure)(el),
    []
  );

  const getObserver = useCallback(() => {
    if (observerRef.current) return observerRef.current;
    if (typeof ResizeObserver === "undefined") return null;
    observerRef.current = new ResizeObserver((entries) => {
      const sizes = cacheRef.current;
      if (!sizes) return;
      let changed = false;
      for (const entry of entries) {
        const target = entry.target as HTMLElement;
        const index = elementToIndex.current.get(target);
        const key = elementToKey.current.get(target);
        if (index === undefined || key === undefined) continue;
        const size = readSize(target);
        if (size > 0 && sizes.measureKey(key, index, size)) changed = true;
      }
      if (changed) {
        observedChangeRef.current = true;
        bumpHeightsVersion((v) => v + 1);
      }
    });
    return observerRef.current;
  }, [readSize]);

  useEffect(() => {
    // Re-observe after a StrictMode remount: the item refs attached before this ran.
    const observer = getObserver();
    if (observer) {
      for (const el of indexToElement.current.values()) observer.observe(el);
    }
    return () => {
      observerRef.current?.disconnect();
      observerRef.current = null;
    };
  }, [getObserver]);

  const measureRef = useCallback(
    (index: number) => {
      let cb = refCallbacks.current.get(index);
      if (!cb) {
        cb = (el: HTMLElement | null) => {
          const prev = indexToElement.current.get(index);
          if (el) {
            const key = cacheRef.current?.keyOf(index) ?? index;
            if (prev === el) {
              elementToKey.current.set(el, key);
              return;
            }
            if (prev) {
              observerRef.current?.unobserve(prev);
              elementToIndex.current.delete(prev);
              elementToKey.current.delete(prev);
            }
            indexToElement.current.set(index, el);
            elementToIndex.current.set(el, index);
            elementToKey.current.set(el, key);
            getObserver()?.observe(el);
          } else if (prev) {
            observerRef.current?.unobserve(prev);
            elementToIndex.current.delete(prev);
            elementToKey.current.delete(prev);
            indexToElement.current.delete(index);
          }
        };
        refCallbacks.current.set(index, cb);
      }
      return cb;
    },
    [getObserver]
  );

  const totalSize = cache.totalSize();
  let visibleStart = 0;
  let visibleEnd = 0;
  let start = 0;
  let end = 0;
  if (count > 0) {
    const base = scrollOffset - scrollMargin;
    visibleStart = cache.indexAt(base);
    visibleEnd = cache.indexAt(base + Math.max(0, viewportSize - 1)) + 1;
    start = Math.max(0, visibleStart - overscan);
    end = Math.min(count, visibleEnd + overscan);
  }

  const virtualItems: VirtualItem[] = [];
  for (let index = start; index < end; index++) {
    virtualItems.push({
      index,
      key: cache.keyOf(index),
      offset: cache.offsetOf(index),
      size: cache.sizeOf(index),
    });
  }

  const pendingRef = useRef<ScrollTarget | null>(null);
  const smoothTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearSmoothTimer = useCallback(() => {
    if (smoothTimerRef.current !== null) {
      clearTimeout(smoothTimerRef.current);
      smoothTimerRef.current = null;
    }
  }, []);

  const clearTarget = useCallback(() => {
    pendingRef.current = null;
    clearSmoothTimer();
  }, [clearSmoothTimer]);

  const maxScrollOf = useCallback((el: HTMLElement | null) => {
    if (el) return Math.max(0, el.scrollHeight - el.clientHeight);
    const sizes = cacheRef.current;
    const total = sizes ? sizes.totalSize() : 0;
    return Math.max(
      0,
      total + latest.current.scrollMargin - viewportSizeRef.current
    );
  }, []);

  const targetOffsetFor = useCallback(
    (index: number, align: "start" | "center" | "end") => {
      const sizes = cacheRef.current;
      if (!sizes) return 0;
      const viewport = viewportSizeRef.current;
      const s = sizes.offsetOf(index) + latest.current.scrollMargin;
      const size = sizes.sizeOf(index);
      let target = s;
      if (align === "center") target = s - (viewport - size) / 2;
      else if (align === "end") target = s + size - viewport;
      return Math.max(0, Math.min(target, maxScrollOf(scrollElRef.current)));
    },
    [maxScrollOf]
  );

  /** Resolves "auto" against the current viewport. null means no scroll. */
  const resolveAlign = useCallback(
    (index: number, align: ScrollAlign): "start" | "center" | "end" | null => {
      if (align !== "auto") return align;
      const sizes = cacheRef.current;
      if (!sizes) return "start";
      const offset = scrollOffsetRef.current;
      const viewport = viewportSizeRef.current;
      const s = sizes.offsetOf(index) + latest.current.scrollMargin;
      const size = sizes.sizeOf(index);
      if (size > viewport) {
        if (s <= offset && s + size >= offset + viewport) return null;
        return s > offset ? "start" : "end";
      }
      if (s >= offset && s + size <= offset + viewport) return null;
      return s < offset ? "start" : "end";
    },
    []
  );

  const startSmoothTimer = useCallback(() => {
    clearSmoothTimer();
    smoothTimerRef.current = setTimeout(() => {
      smoothTimerRef.current = null;
      const pending = pendingRef.current;
      const el = scrollElRef.current;
      if (!pending || !el) return;
      const newTarget = targetOffsetFor(pending.index, pending.align);
      if (Math.abs(newTarget - pending.issuedOffset) > 1) {
        el.scrollTop = newTarget;
        const issued = getScrollOffset(el);
        pending.issuedOffset = issued;
        setScrollOffset(issued);
      }
      pending.behavior = "auto";
      pending.attempts = 1;
      pending.quietPasses = 0;
    }, SMOOTH_SETTLE_MS);
  }, [clearSmoothTimer, targetOffsetFor]);

  const issueScroll = useCallback(
    (
      index: number,
      align: "start" | "center" | "end",
      behavior: ScrollBehavior
    ) => {
      const el = scrollElRef.current;
      const target = targetOffsetFor(index, align);
      if (!el) {
        pendingRef.current = {
          index,
          align,
          behavior,
          issuedOffset: target,
          attempts: 0,
          quietPasses: 0,
          issued: false,
        };
        return;
      }
      clearSmoothTimer();
      pendingRef.current = {
        index,
        align,
        behavior,
        issuedOffset: target,
        attempts: 0,
        quietPasses: 0,
        issued: true,
      };
      if (behavior === "smooth") {
        el.scrollTo({ top: target, behavior: "smooth" });
        startSmoothTimer();
        return;
      }
      el.scrollTop = target;
      const issued = getScrollOffset(el);
      pendingRef.current.issuedOffset = issued;
      setScrollOffset(issued);
    },
    [clearSmoothTimer, startSmoothTimer, targetOffsetFor]
  );

  const scrollToIndex = useCallback(
    (index: number, options?: ScrollToIndexOptions) => {
      const total = latest.current.count;
      if (total === 0) return;
      if (Number.isNaN(index)) return;
      const clamped = Math.min(Math.max(0, Math.floor(index)), total - 1);
      const align = resolveAlign(clamped, options?.align ?? "start");
      if (align === null) return;
      issueScroll(clamped, align, options?.behavior ?? "auto");
    },
    [issueScroll, resolveAlign]
  );

  const scrollToOffset = useCallback(
    (offset: number, options?: ScrollToOffsetOptions) => {
      if (Number.isNaN(offset)) return;
      clearTarget();
      const el = scrollElRef.current;
      if (!el) return;
      const target = Math.max(0, Math.min(offset, maxScrollOf(el)));
      if ((options?.behavior ?? "auto") === "smooth") {
        el.scrollTo({ top: target, behavior: "smooth" });
        return;
      }
      el.scrollTop = target;
      setScrollOffset(getScrollOffset(el));
    },
    [clearTarget, maxScrollOf]
  );

  /**
   * Keeps an issued scroll on its item while the items around it are measured.
   * Runs after every commit; `geometryChanged` says whether this commit moved
   * anything, which is what tells a stale target from a settled one.
   */
  const checkPendingTarget = useCallback(
    (geometryChanged: boolean) => {
      const pending = pendingRef.current;
      const el = scrollElRef.current;
      if (!pending || !el || !pending.issued) return;
      if (pending.index >= latest.current.count) {
        clearTarget();
        return;
      }
      if (pending.behavior === "smooth") return;
      const landed = Math.abs(getScrollOffset(el) - pending.issuedOffset) <= 1;
      if (!landed) return;
      const newTarget = targetOffsetFor(pending.index, pending.align);
      if (Math.abs(newTarget - pending.issuedOffset) <= 1) {
        if (!geometryChanged) {
          pending.quietPasses += 1;
          if (pending.quietPasses >= SETTLED_QUIET_PASSES) clearTarget();
        }
        return;
      }
      el.scrollTop = newTarget;
      const issued = getScrollOffset(el);
      pending.issuedOffset = issued;
      setScrollOffset(issued);
      pending.quietPasses = 0;
      pending.attempts += 1;
      if (pending.attempts >= MAX_CORRECTION_ATTEMPTS) clearTarget();
    },
    [clearTarget, targetOffsetFor]
  );

  const attachedOnceRef = useRef(false);
  const lastAttachedElRef = useRef<HTMLElement | null>(null);

  useIsomorphicLayoutEffect(() => {
    const el = scrollEl;
    if (!el) return;

    if (lastAttachedElRef.current && lastAttachedElRef.current !== el) {
      clearTarget();
    }
    lastAttachedElRef.current = el;

    if (!attachedOnceRef.current) {
      attachedOnceRef.current = true;
      const initial = initialRef.current;
      if (initial.initialScrollIndex !== undefined) {
        scrollToIndex(initial.initialScrollIndex, {
          align: "start",
          behavior: "auto",
        });
      } else if (
        initial.initialScrollOffset !== undefined &&
        initial.initialScrollOffset > 0
      ) {
        el.scrollTop = initial.initialScrollOffset;
      }
    }
    const pending = pendingRef.current;
    if (pending && !pending.issued) {
      issueScroll(pending.index, pending.align, pending.behavior);
    }

    const size = getViewportSize(el);
    if (size > 0) setViewportSize(size);
    setScrollOffset(getScrollOffset(el));

    let rafId: number | null = null;

    const handleFrame = () => {
      rafId = null;
      const offset = getScrollOffset(el);
      const target = pendingRef.current;
      if (target && target.issued) {
        if (target.behavior === "smooth") {
          startSmoothTimer();
        } else if (Math.abs(offset - target.issuedOffset) > 1) {
          clearTarget();
        }
      }
      setScrollOffset(offset);
      latest.current.onScroll?.(offset);
    };

    const handleScroll = () => {
      if (rafId === null) rafId = requestAnimationFrame(handleFrame);
    };

    const handleUserInput = () => {
      clearTarget();
    };

    const handleViewportResize = () => {
      setViewportSize(getViewportSize(el));
    };

    el.addEventListener("scroll", handleScroll, { passive: true });
    el.addEventListener("wheel", handleUserInput, { passive: true });
    el.addEventListener("touchstart", handleUserInput, { passive: true });
    el.addEventListener("pointerdown", handleUserInput, { passive: true });
    el.addEventListener("keydown", handleUserInput, { passive: true });

    let viewportObserver: ResizeObserver | null = null;
    if (typeof ResizeObserver !== "undefined") {
      viewportObserver = new ResizeObserver(handleViewportResize);
      viewportObserver.observe(el);
    }

    return () => {
      el.removeEventListener("scroll", handleScroll);
      el.removeEventListener("wheel", handleUserInput);
      el.removeEventListener("touchstart", handleUserInput);
      el.removeEventListener("pointerdown", handleUserInput);
      el.removeEventListener("keydown", handleUserInput);
      viewportObserver?.disconnect();
      if (rafId !== null) cancelAnimationFrame(rafId);
      clearSmoothTimer();
    };
  }, [
    scrollEl,
    clearSmoothTimer,
    clearTarget,
    issueScroll,
    scrollToIndex,
    startSmoothTimer,
  ]);

  const lastViewportRef = useRef(viewportSize);
  const suppressRangeReportRef = useRef(false);

  useIsomorphicLayoutEffect(() => {
    const sizes = cacheRef.current;
    if (!sizes) return;
    let changed = false;
    for (const [index, el] of indexToElement.current) {
      const size = readSize(el);
      if (size > 0 && sizes.measure(index, size)) changed = true;
    }
    if (changed) {
      bumpHeightsVersion((v) => v + 1);
      suppressRangeReportRef.current = true;
    }

    const observedChange = observedChangeRef.current;
    observedChangeRef.current = false;
    const viewportChanged = lastViewportRef.current !== viewportSize;
    lastViewportRef.current = viewportSize;
    checkPendingTarget(changed || observedChange || viewportChanged);

    const callbacks = refCallbacks.current;
    if (callbacks.size > 2 * (end - start) + 64) {
      for (const index of callbacks.keys()) {
        if (index < start || index >= end) callbacks.delete(index);
      }
    }
  });

  const lastReportedRef = useRef<VirtualRange | null>(null);

  useEffect(() => {
    if (suppressRangeReportRef.current) {
      suppressRangeReportRef.current = false;
      return;
    }
    const last = lastReportedRef.current;
    const range: VirtualRange = { start, end, visibleStart, visibleEnd };
    if (last === null) {
      lastReportedRef.current = range;
      if (end > start) latest.current.onRangeChange?.(range);
      return;
    }
    if (
      last.start === range.start &&
      last.end === range.end &&
      last.visibleStart === range.visibleStart &&
      last.visibleEnd === range.visibleEnd
    ) {
      return;
    }
    lastReportedRef.current = range;
    latest.current.onRangeChange?.(range);
  }, [start, end, visibleStart, visibleEnd, heightsVersion]);

  const offsetOf = useCallback(
    (index: number) => cacheRef.current?.offsetOf(index) ?? 0,
    []
  );
  const sizeOf = useCallback(
    (index: number) => cacheRef.current?.sizeOf(index) ?? 0,
    []
  );
  const indexAt = useCallback(
    (offset: number) => cacheRef.current?.indexAt(offset) ?? 0,
    []
  );
  const getScrollElement = useCallback(() => scrollElRef.current, []);

  return {
    scrollRef,
    measureRef,
    virtualItems,
    start,
    end,
    visibleStart,
    visibleEnd,
    totalSize,
    scrollOffset,
    viewportSize,
    offsetOf,
    sizeOf,
    indexAt,
    scrollToIndex,
    scrollToOffset,
    getScrollElement,
  };
}
