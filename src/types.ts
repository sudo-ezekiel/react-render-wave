import type {
  CSSProperties,
  FC,
  JSX,
  KeyboardEventHandler,
  ReactNode,
  Ref,
  RefObject,
} from "react";

export interface VirtualRenderWaveHandle {
  /** Scroll so the item at the given index sits at the top of the viewport. */
  scrollTo: (index: number, behavior?: ScrollBehavior) => void;
  /** Scroll to a pixel offset. */
  scrollToOffset: (px: number, behavior?: ScrollBehavior) => void;
  /** Indexes that are currently rendered and revealed. */
  getVisibleIndexes: () => number[];
  /** The scrollable outer element, or null before mount. */
  getScrollElement: () => HTMLElement | null;
}

/**
 * Props handed to a custom outerElement or innerElement component.
 * Spread everything onto your DOM node so scrolling, focus, and keyboard
 * navigation keep working.
 */
export interface WrapperProps {
  ref: RefObject<HTMLElement | null>;
  style: CSSProperties;
  className?: string;
  children: ReactNode;
  role?: string;
  tabIndex?: number;
  onKeyDown?: KeyboardEventHandler<HTMLElement>;
  "aria-label"?: string;
}

export type HTMLTag = keyof JSX.IntrinsicElements & keyof HTMLElementTagNameMap;

export interface VirtualRenderWaveProps<T = unknown> {
  items: T[];
  /**
   * Item height in pixels. With dynamic content this is the estimate used
   * until an item has been measured.
   */
  itemHeight: number;
  /**
   * Height of the scroll container in pixels. Default 400. Pass a height in
   * `style` instead (for example "100%") to size it from the parent; the
   * viewport is measured with a ResizeObserver either way.
   */
  containerHeight?: number;
  /** Items revealed per wave. Default 20. */
  batchSize?: number;
  /** Delay in milliseconds between waves. Default 50. */
  interval?: number;
  /** Extra items rendered above and below the viewport. Default 5. */
  overscan?: number;
  /** Index of the first item to reveal. Default 0. */
  startIndex?: number;
  className?: string;
  style?: CSSProperties;
  renderItem: (item: T, index: number) => ReactNode;
  /** Rendered in place of items the wave has not reached yet. */
  renderSkeleton?: (index: number) => ReactNode;
  /** Stable key per item. Defaults to the item index. */
  getItemKey?: (item: T, index: number) => string | number;
  /** Scrolls to the index whenever the value changes. */
  scrollToIndex?: number;
  outerElement?: HTMLTag | FC<WrapperProps>;
  innerElement?: HTMLTag | FC<WrapperProps>;
  /** Fade newly revealed items in. Default false. */
  transition?: boolean;
  /**
   * Align the scroll position to the nearest batch boundary after scrolling
   * stops. Assumes fixed item heights. Default false.
   */
  snapToBatch?: boolean;
  /** Called once each time the user reaches the end of the scroll area. */
  onEndReached?: () => void;
  /** Distance in pixels from the bottom that counts as the end. Default 10. */
  endReachedThreshold?: number;
  /** Called with the current scrollTop, at most once per animation frame. */
  onScroll?: (scrollTop: number) => void;
  /** Enable ArrowUp/ArrowDown, PageUp/PageDown, Home and End. Default false. */
  keyboardNavigation?: boolean;
  /** Renders a sticky header for the group of the topmost visible item. */
  renderStickyHeader?: (group: string) => ReactNode;
  /** Property name or function that yields an item's group label. */
  groupByKey?: keyof T | ((item: T, index: number) => string);
  /** Accessible label for the scroll container. */
  ariaLabel?: string;
}

export type VirtualRenderWaveComponent = <T>(
  props: VirtualRenderWaveProps<T> & { ref?: Ref<VirtualRenderWaveHandle> }
) => JSX.Element;
