import React, {
  JSX,
  useEffect,
  useState,
  useImperativeHandle,
  forwardRef,
  useRef,
} from "react";
import { useRenderWave } from "./useRenderWave";
import { useVirtualScrollCore } from "./useVirtualScrollCore";

export interface VirtualRenderWaveHandle {
  scrollTo: (index: number) => void;
  scrollToOffset: (px: number) => void;
}

export interface WrapperProps {
  ref: React.RefObject<HTMLElement | null>;
  style: React.CSSProperties;
  className?: string;
  children: React.ReactNode;
}

type HTMLTag = keyof JSX.IntrinsicElements & keyof HTMLElementTagNameMap;

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
  scrollToIndex?: number;
  outerElement?: HTMLTag | React.FC<WrapperProps>;
  innerElement?: HTMLTag | React.FC<WrapperProps>;
}

export const VirtualRenderWave = forwardRef(
  <T,>(
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
      scrollToIndex,
      outerElement,
      innerElement,
    }: VirtualRenderWaveProps<T>,
    ref: React.Ref<VirtualRenderWaveHandle>
  ): JSX.Element => {
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

    useImperativeHandle(ref, () => ({
      scrollTo: (index: number) => {
        const offset = index * itemHeight;
        outerContainerRef.current?.scrollTo({ top: offset });
      },
      scrollToOffset: (offset: number) => {
        outerContainerRef.current?.scrollTo({ top: offset });
      },
    }));

    useEffect(() => {
      if (typeof scrollToIndex === "number" && outerContainerRef.current) {
        const offset = scrollToIndex * itemHeight;
        outerContainerRef.current.scrollTo({ top: offset });
      }
    }, [scrollToIndex, itemHeight]);

    useEffect(() => {
      if (itemHeight <= 0) {
        console.warn(
          "[VirtualRenderWave] `itemHeight` must be greater than 0. Received:",
          itemHeight
        );
      }
      if (items.length === 0) {
        console.warn(
          "[VirtualRenderWave] `items` array is empty. Nothing will be rendered."
        );
      }
      if (typeof renderItem !== "function") {
        console.warn(
          "[VirtualRenderWave] `renderItem` must be a function that returns a React element."
        );
      }
      if (
        scrollToIndex != null &&
        (scrollToIndex < 0 || scrollToIndex >= items.length)
      ) {
        console.warn(
          `[VirtualRenderWave] \`scrollToIndex\` is out of bounds. Received: ${scrollToIndex}, but items.length is ${items.length}.`
        );
      }
    }, []);

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
          style={{
            position: "absolute",
            top: i * itemHeight,
            left: 0,
            right: 0,
          }}
        >
          {renderItem(items[i], i)}
        </div>
      ));

    const renderElement = (
      Component: HTMLTag | React.FC<WrapperProps>,
      props: WrapperProps
    ) => {
      if (typeof Component === "string") {
        return React.createElement(Component, {
          ref: props.ref,
          style: props.style,
          className: props.className,
          children: props.children,
        });
      }
      return <Component {...props} />;
    };

    return renderElement(outerElement || "div", {
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
    });
  }
);

VirtualRenderWave.displayName = "VirtualRenderWave";
