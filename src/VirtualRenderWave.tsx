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

export interface VirtualRenderWaveHandle {
  scrollTo: (index: number) => void;
  scrollToOffset: (px: number) => void;
  getVisibleIndexes: () => number[];
}

export interface WrapperProps {
  ref: React.RefObject<HTMLElement | null>;
  style: React.CSSProperties;
  className?: string;
  children: React.ReactNode;
}

type HTMLTag = keyof JSX.IntrinsicElements & keyof HTMLElementTagNameMap;

export interface VirtualRenderWaveProps<T> {
  items: T[];
  itemHeight: number;
  containerHeight?: number;
  batchSize?: number;
  interval?: number;
  overscan?: number;
  startIndex?: number;
  className?: string;
  style?: React.CSSProperties;
  renderItem: (item: T, index: number) => React.ReactNode;
  renderSkeleton?: (index: number) => React.ReactNode;
  scrollToIndex?: number;
  outerElement?: HTMLTag | React.FC<WrapperProps>;
  innerElement?: HTMLTag | React.FC<WrapperProps>;
  transition?: boolean;
  snapToBatch?: boolean;
  onEndReached?: () => void;
  keyboardNavigation?: boolean;
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
  }: VirtualRenderWaveProps<T>,
  ref: React.Ref<VirtualRenderWaveHandle>
): JSX.Element {
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
      outerContainerRef.current?.scrollTo({ top: offset, behavior: 'smooth' });
    },
    scrollToOffset: (offset: number) => {
      outerContainerRef.current?.scrollTo({ top: offset, behavior: 'smooth' });
    },
    getVisibleIndexes: () =>
      revealedIndexes.filter((i) => i >= start && i < end),
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
          const batchPixelSize = itemHeight * batchSize;
          const targetIndex =
            Math.round(el.scrollTop / batchPixelSize) * batchSize;
          const targetOffset = targetIndex * itemHeight;
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
      if (!el.contains(document.activeElement)) return;

      const scrollStep =
        e.key === "PageUp" || e.key === "PageDown"
          ? el.clientHeight
          : itemHeight;

      switch (e.key) {
        case "ArrowDown":
        case "PageDown":
          el.scrollBy({ top: scrollStep, behavior: "smooth" });
          break;
        case "ArrowUp":
        case "PageUp":
          el.scrollBy({ top: -scrollStep, behavior: "smooth" });
          break;
        case "Home":
          el.scrollTo({ top: 0, behavior: "smooth" });
          break;
        case "End":
          el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
          break;
      }
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
        children: renderElement(innerElement || "div", {
          ref: innerContainerRef,
          style: {
            position: "relative",
            height: items.length * itemHeight,
            width: "100%",
          },
          children: visibleItems,
        }),
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
