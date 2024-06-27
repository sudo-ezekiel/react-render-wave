import { DependencyList, RefObject } from "react";

export interface OnResizeEvent {
  width: number;
  height: number;
}

export interface OnResize {
  (event: OnResizeEvent): void;
}

import useIsoLayoutEffect from "./useIsoLayoutEffect";
import useLatest from "./useLatest";

export default <T extends HTMLElement>(
  ref: RefObject<T>,
  resizeEvent: OnResize,
  deps: DependencyList
): void => {
  const resizeEventRef = useLatest(resizeEvent);

  useIsoLayoutEffect(() => {
    if (!ref.current) return;

    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      resizeEventRef.current({ width, height });
    });

    observer.observe(ref.current);

    return () => observer.disconnect();
  }, [ref, ...deps]);
};
