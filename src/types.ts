import type {
  CSSProperties,
  JSX,
  KeyboardEventHandler,
  ReactNode,
  Ref,
  RefObject,
} from "react";
import type {
  ItemKey,
  ScrollToIndexOptions,
  VirtualRange,
} from "./useVirtualWindow";

/** How rows are chosen for the next wave. */
export type RevealMode = "sequential" | "viewport";

export interface VirtualRenderWaveHandle {
  /**
   * Scroll to an item. Pass a behavior string, or { align, behavior }.
   * Default align "start", default behavior "smooth".
   */
  scrollTo: (
    index: number,
    options?: ScrollBehavior | ScrollToIndexOptions
  ) => void;
  /** Scroll to a pixel offset. */
  scrollToOffset: (px: number, behavior?: ScrollBehavior) => void;
  /** Indexes that are currently rendered and revealed. */
  getVisibleIndexes: () => number[];
  /** The scrollable outer element, or null before mount. */
  getScrollElement: () => HTMLElement | null;
}

/**
 * Props handed to a custom outerElement or innerElement component. Spread
 * every prop onto your DOM node so scrolling, focus, and keyboard navigation
 * keep working. On React 19 the ref arrives as a prop; to support React 18
 * too, wrap the component in forwardRef and attach the forwarded ref to the
 * node.
 */
export interface WrapperProps {
  /** Attach this to the element you render: the list scrolls and measures through it. */
  ref?: RefObject<any>;
  style: CSSProperties;
  className?: string;
  children: ReactNode;
  role?: string;
  tabIndex?: number;
  onKeyDown?: KeyboardEventHandler<HTMLElement>;
  "aria-label"?: string;
}

/**
 * A component accepted as outerElement or innerElement: a function component
 * or a forwardRef component taking WrapperProps. Spelled as a bare call
 * signature rather than ComponentType<WrapperProps>, because a forwardRef
 * component is not assignable to ComponentType under @types/react 18. The
 * return type carries Promise<ReactNode> so that a component typed as
 * FC<WrapperProps> is accepted under @types/react 19, where FC allows it.
 */
export type WrapperComponent = (
  props: WrapperProps
) => ReactNode | Promise<ReactNode>;

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
  /**
   * Which rows the wave reveals. Default "sequential", which counts forward
   * from startIndex regardless of the scroll position, the behaviour of v3.0.
   * "viewport" reveals the rows inside the rendered window in batches and
   * never re-hides a revealed row, which lets batchSize stay small on a long
   * list.
   */
  revealMode?: RevealMode;
  className?: string;
  style?: CSSProperties;
  renderItem: (item: T, index: number) => ReactNode;
  /** Rendered in place of items the wave has not reached yet. */
  renderSkeleton?: (index: number) => ReactNode;
  /** Stable key per item. Defaults to the item index. */
  getItemKey?: (item: T, index: number) => ItemKey;
  /** Scrolls to the index whenever the value changes. */
  scrollToIndex?: number;
  /**
   * Pixel offset for the first render, read once. The first paint and the
   * server markup already show that window.
   */
  initialScrollOffset?: number;
  /**
   * Index to open at, read once. Wins over initialScrollOffset, and is
   * corrected once the rows above it have been measured.
   */
  initialScrollIndex?: number;
  outerElement?: HTMLTag | WrapperComponent;
  innerElement?: HTMLTag | WrapperComponent;
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
  /**
   * Called after commit whenever the rendered or the visible range changes.
   * Both are half-open: `end` and `visibleEnd` are exclusive.
   */
  onRangeChange?: (range: VirtualRange) => void;
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
