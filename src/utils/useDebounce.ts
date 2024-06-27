import { useCallback, useRef } from "react";
import now from "./now";
import useLatest from "./useLatest";

interface Fn {
  (): void;
}

export default (resizeEvent: Fn, delay: number): [Fn, Fn] => {
  const rafRef = useRef<number>();
  const resizeEventRef = useLatest(resizeEvent);

  const cancel = useCallback(() => {
    if (rafRef.current !== undefined) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = undefined;
    }
  }, []);

  const tick = useCallback(
    (start: number) => {
      const elapsed = now() - start;
      if (elapsed >= delay) {
        resizeEventRef.current();
      } else {
        rafRef.current = requestAnimationFrame(() => tick(start));
      }
    },
    [delay]
  );

  const fn = useCallback(() => {
    cancel();
    const startTime = now();
    tick(startTime);
  }, [cancel, tick]);

  return [fn, cancel];
};
