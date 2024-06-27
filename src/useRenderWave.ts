import { useCallback, useRef, useState } from "react";

import { debounce } from "lodash";

import {
  Item,
  Align,
  Options,
  Return,
  State,
  Measure,
  ScrollTo,
  StartItem,
  ScrollToItem,
  ScrollToOptions,
  ScrollToItemOptions,
} from "./types";

import now from "./utils/now";
import isNumber from "./utils/isNumber";
import useLatest from "./utils/useLatest";
import useDebounce from "./utils/useDebounce";
import shouldUpdate from "./utils/shouldUpdate";
import useResizeEffect from "./utils/useResizeEffect";
import useIsoLayoutEffect from "./utils/useIsoLayoutEffect";
import getInitializedState from "./utils/getInitializedState";
import findNearestBinarySearch from "./utils/findNearestBinarySearch";

export default <
  O extends HTMLElement = HTMLElement,
  I extends HTMLElement = O
>({
  loadMore,
  onScroll,
  onResize,
  itemCount,
  horizontal,
  resetScroll,
  preRenderedItemCount,
  isItemLoaded,
  itemSize = 45,
  fixedIndices,
  useIsScrolling,
  overscanCount = 1,
  loadMoreCount = 15,
}: Options): Return<O, I> => {
  // scroll duration, basically ease in out
  const scrollDuration = (distance: number = 100): any => {
    const minDuration = 100;
    const maxDuration = 500;
    const duration = distance * 0.083;
    return Math.min(Math.max(duration, minDuration), maxDuration);
  };

  // scroll ease me
  const scrollEasingFunction = (time: number = 100) => {
    return -(Math.cos(Math.PI * time) - 1) / 2;
  };

  // State initialization
  const [state, setState] = useState<State>(() =>
    getInitializedState(itemSize, preRenderedItemCount)
  );

  // Basic refs
  const previousVStopRef = useRef(-1);
  const outerContainerRef = useRef<O>(null);
  const innerContainerRef = useRef<I>(null);
  const scrollOffsetRef = useRef(0);
  const previousItemIndexRef = useRef(-1);
  const userHasScrolledRef = useRef(true);
  const componentIsMountedRef = useRef(false);
  const isCurrentlyScrollingRef = useRef(true);
  const scrollToItemInProgressRef = useRef(false);
  const dynamicSizeEnabledRef = useRef(false);
  const measurementDataRef = useRef<Measure[]>([]);
  const scrollToAnimationFrameRef = useRef<number>();
  const outerContainerDimensionsRef = useRef({ width: 0, height: 0 });
  const resizeObserverMapRef = useRef<Map<Element, ResizeObserver>>(new Map());

  // Refs with latest values
  const loadMoreCallbackRef = useLatest(loadMore);
  const itemSizeCallbackRef = useLatest(itemSize);
  const onScrollCallbackRef = useLatest(onScroll);
  const onResizeCallbackRef = useLatest(onResize);
  const scrollDurationRef = useLatest(scrollDuration);
  const isItemLoadedCallbackRef = useLatest(isItemLoaded);
  const fixedIndicesCallbackRef = useLatest(fixedIndices);
  const scrollEasingFunctionRef = useLatest(scrollEasingFunction);
  const useIsScrollingRef = useLatest(useIsScrolling);

  // Directional keys
  const sizeKey = horizontal ? "width" : "height";
  const marginKey = horizontal ? "marginLeft" : "marginTop";
  const scrollKey = horizontal ? "scrollLeft" : "scrollTop";



  return {
    outerContainerRef,
    innerContainerRef,
    items: state.items,
    scrollTo: scrollToOffset,
    scrollToItem,
    startItem,
  };
};
