import React, { JSX, useEffect, useState } from "react";
import { useRenderWave } from "./useRenderWave";
import { useVirtualScrollCore } from "./useVirtualScrollCore";

interface VirtualRenderWaveProps<T> {
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
}

export function VirtualRenderWave<T>({
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
}: VirtualRenderWaveProps<T>): JSX.Element {
  const { outerContainerRef, innerContainerRef } = useVirtualScrollCore<
    HTMLDivElement,
    HTMLDivElement
  >({
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

  useEffect(() => {
    const el = outerContainerRef.current;
    if (!el) return;

    const handleScroll = () => setScrollTop(el.scrollTop);

    const resizeObserver = new ResizeObserver(() => {
      setContainerClientHeight(el.clientHeight);
    });

    el.addEventListener("scroll", handleScroll);
    resizeObserver.observe(el);

    setScrollTop(el.scrollTop);
    setContainerClientHeight(el.clientHeight);

    return () => {
      el.removeEventListener("scroll", handleScroll);
      resizeObserver.disconnect();
    };
  }, [outerContainerRef]);

  const start = Math.max(0, Math.floor(scrollTop / itemHeight) - overscan);
  const end = Math.min(
    items.length,
    Math.ceil((scrollTop + containerClientHeight) / itemHeight) + overscan
  );

  const visibleItems = revealedIndexes
    .filter((i) => i >= start && i < end)
    .map((i) => (
      <div
        key={i}
        style={{ position: "absolute", top: i * itemHeight, left: 0, right: 0 }}
      >
        {renderItem(items[i], i)}
      </div>
    ));

  return (
    <div
      ref={outerContainerRef}
      className={className}
      style={{
        position: "relative",
        overflowY: "auto",
        height: containerHeight,
        ...style,
      }}
    >
      <div
        ref={innerContainerRef}
        style={{
          position: "relative",
          height: items.length * itemHeight,
          width: "100%",
        }}
      >
        {visibleItems}
      </div>
    </div>
  );
}
