import { act, renderHook } from "@testing-library/react";
import { StrictMode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  useViewportReveal,
  type UseViewportRevealOptions,
} from "../src/useViewportReveal";

beforeEach(() => {
  vi.useFakeTimers({
    toFake: [
      "setTimeout",
      "clearTimeout",
      "requestAnimationFrame",
      "cancelAnimationFrame",
    ],
  });
});

afterEach(() => {
  vi.useRealTimers();
});

/** Advances far enough for exactly one wave (interval 50 plus one frame). */
const advanceWave = (ms = 100) => {
  act(() => {
    vi.advanceTimersByTime(ms);
  });
};

/** Indexes of [lo, hi) that the hook reports as revealed. */
const revealedIn = (
  isRevealed: (index: number) => boolean,
  lo: number,
  hi: number
) => {
  const out: number[] = [];
  for (let i = lo; i < hi; i++) if (isRevealed(i)) out.push(i);
  return out;
};

const range = (lo: number, hi: number) =>
  Array.from({ length: hi - lo }, (_, i) => lo + i);

describe("useViewportReveal edge cases", () => {
  it("reveals only rows inside a window that shrank before the wave fired", () => {
    const { result, rerender } = renderHook(
      (props: UseViewportRevealOptions) => useViewportReveal(props),
      {
        initialProps: {
          count: 1000,
          start: 0,
          end: 15,
          batchSize: 5,
          interval: 50,
        },
      }
    );
    // First render primes 0..4 synchronously.
    expect(revealedIn(result.current.isRevealed, 0, 15)).toEqual(range(0, 5));

    // The window shrinks to [0, 8) before the wave has had a chance to fire.
    rerender({ count: 1000, start: 0, end: 8, batchSize: 5, interval: 50 });
    expect(result.current.pendingCount).toBe(3);

    advanceWave();

    // Only rows inside the shrunk window (5, 6, 7) are picked up: nothing
    // beyond index 8 is ever touched.
    expect(revealedIn(result.current.isRevealed, 0, 15)).toEqual(range(0, 8));
    expect(result.current.pendingCount).toBe(0);
  });

  it("floors a fractional batchSize and clamps a zero or negative one to 1 per wave", () => {
    const zero = renderHook(() =>
      useViewportReveal({ count: 100, start: 0, end: 50, batchSize: 0 })
    );
    expect(revealedIn(zero.result.current.isRevealed, 0, 50)).toEqual([0]);

    const negative = renderHook(() =>
      useViewportReveal({ count: 100, start: 0, end: 50, batchSize: -3 })
    );
    expect(revealedIn(negative.result.current.isRevealed, 0, 50)).toEqual([0]);

    const fractional = renderHook(() =>
      useViewportReveal({ count: 100, start: 0, end: 50, batchSize: 2.9 })
    );
    expect(revealedIn(fractional.result.current.isRevealed, 0, 50)).toEqual([
      0, 1,
    ]);
  });

  it("re-arms with the new interval when interval changes mid-wave", () => {
    const { result, rerender } = renderHook(
      (props: UseViewportRevealOptions) => useViewportReveal(props),
      {
        initialProps: {
          count: 1000,
          start: 0,
          end: 15,
          batchSize: 5,
          interval: 50,
        },
      }
    );
    expect(result.current.pendingCount).toBe(10);

    // 30ms into a 50ms wave, the interval changes: the pending timer is torn
    // down and a fresh 200ms one takes its place.
    advanceWave(30);
    rerender({ count: 1000, start: 0, end: 15, batchSize: 5, interval: 200 });
    expect(result.current.pendingCount).toBe(10);

    // Well short of the new 200ms interval: nothing revealed yet.
    advanceWave(150);
    expect(result.current.pendingCount).toBe(10);

    // Past 200ms plus a frame from the rerender: the wave has now fired.
    advanceWave(80);
    expect(result.current.pendingCount).toBe(5);
  });

  it("clears revealed state and re-primes synchronously when getItemKey toggles to undefined and back", () => {
    const order = ["a", "b", "c", "d", "e", "f"];
    const { result, rerender } = renderHook(
      (props: UseViewportRevealOptions) => useViewportReveal(props),
      {
        initialProps: {
          count: 6,
          start: 0,
          end: 6,
          batchSize: 2,
          getItemKey: (index: number) => order[index],
        } as UseViewportRevealOptions,
      }
    );
    expect(revealedIn(result.current.isRevealed, 0, 6)).toEqual([0, 1]);
    advanceWave();
    expect(revealedIn(result.current.isRevealed, 0, 6)).toEqual([0, 1, 2, 3]);

    // Switch to index-based tracking: the keyed set is discarded and the
    // first batch is re-primed against plain indexes.
    rerender({ count: 6, start: 0, end: 6, batchSize: 2 });
    expect(revealedIn(result.current.isRevealed, 0, 6)).toEqual([0, 1]);
    expect(result.current.pendingCount).toBe(4);

    // Switching back to keyed tracking discards the index-based set too.
    rerender({
      count: 6,
      start: 0,
      end: 6,
      batchSize: 2,
      getItemKey: (index: number) => order[index],
    });
    expect(revealedIn(result.current.isRevealed, 0, 6)).toEqual([0, 1]);
    expect(result.current.pendingCount).toBe(4);
  });

  it("keeps previously revealed indexes visible once count shrinks below them, and reports zero pending when hi <= lo", () => {
    const { result, rerender } = renderHook(
      (props: UseViewportRevealOptions) => useViewportReveal(props),
      { initialProps: { count: 100, start: 0, end: 5, batchSize: 5 } }
    );
    expect(revealedIn(result.current.isRevealed, 0, 5)).toEqual(range(0, 5));

    // count shrinks to 3, but index 4 was already marked revealed. The
    // documented behaviour is that isRevealed reports whatever the set says,
    // regardless of count.
    rerender({ count: 3, start: 0, end: 5, batchSize: 5 });
    expect(result.current.isRevealed(4)).toBe(true);

    // A window where start sits past the (count-clamped) end has hi <= lo:
    // nothing is pending by definition.
    rerender({ count: 3, start: 5, end: 15, batchSize: 5 });
    expect(result.current.pendingCount).toBe(0);
  });

  it("reveals the first batch once, waves add exactly batchSize, and reset re-primes exactly one batch under StrictMode", () => {
    const { result } = renderHook(
      () =>
        useViewportReveal({
          count: 1000,
          start: 0,
          end: 20,
          batchSize: 4,
          interval: 50,
        }),
      {
        wrapper: ({ children }) => <StrictMode>{children}</StrictMode>,
      }
    );
    expect(revealedIn(result.current.isRevealed, 0, 20)).toEqual(range(0, 4));
    expect(result.current.pendingCount).toBe(16);

    advanceWave();
    expect(revealedIn(result.current.isRevealed, 0, 20)).toEqual(range(0, 8));
    expect(result.current.pendingCount).toBe(12);

    act(() => {
      result.current.reset();
    });
    expect(revealedIn(result.current.isRevealed, 0, 20)).toEqual(range(0, 4));
    expect(result.current.pendingCount).toBe(16);
  });

  it("primes the first batch synchronously and schedules no timer when enabled is false at mount", () => {
    const { result } = renderHook(() =>
      useViewportReveal({
        count: 500,
        start: 0,
        end: 30,
        batchSize: 7,
        enabled: false,
      })
    );
    expect(revealedIn(result.current.isRevealed, 0, 30)).toEqual(range(0, 7));
    expect(result.current.pendingCount).toBe(23);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("keeps rows revealed when the window moves away and back, and counts only never-revealed rows as pending", () => {
    const { result, rerender } = renderHook(
      (props: UseViewportRevealOptions) => useViewportReveal(props),
      {
        initialProps: {
          count: 1000,
          start: 0,
          end: 15,
          batchSize: 5,
          interval: 50,
        },
      }
    );
    advanceWave();
    advanceWave();
    expect(result.current.pendingCount).toBe(0);

    rerender({ count: 1000, start: 100, end: 115, batchSize: 5, interval: 50 });
    advanceWave();
    expect(revealedIn(result.current.isRevealed, 100, 115)).toEqual(
      range(100, 105)
    );

    // Move to a window overlapping both the fully revealed [0, 15) and the
    // partially revealed [100, 105): pendingCount counts only what neither
    // wave has touched yet.
    rerender({ count: 1000, start: 5, end: 105, batchSize: 5, interval: 50 });
    const revealedInWindow = revealedIn(
      result.current.isRevealed,
      5,
      105
    ).length;
    expect(revealedInWindow).toBe(10 + 5); // [5, 15) and [100, 105)
    expect(result.current.pendingCount).toBe(100 - revealedInWindow);
  });

  it("reveals batchSize rows per wave and drains pendingCount accordingly across a very large window", () => {
    const { result } = renderHook(() =>
      useViewportReveal({
        count: 10000,
        start: 0,
        end: 5000,
        batchSize: 20,
        interval: 50,
      })
    );
    expect(result.current.pendingCount).toBe(4980);

    advanceWave();
    expect(result.current.pendingCount).toBe(4960);
    expect(revealedIn(result.current.isRevealed, 0, 40)).toEqual(range(0, 40));

    advanceWave();
    expect(result.current.pendingCount).toBe(4940);
  });

  it("reveals the first batch synchronously the moment count goes from 0 to non-zero", () => {
    const { result, rerender } = renderHook(
      (props: UseViewportRevealOptions) => useViewportReveal(props),
      { initialProps: { count: 0, start: 0, end: 0, batchSize: 8 } }
    );
    expect(result.current.pendingCount).toBe(0);
    expect(revealedIn(result.current.isRevealed, 0, 10)).toEqual([]);

    rerender({ count: 250, start: 0, end: 30, batchSize: 8 });
    expect(revealedIn(result.current.isRevealed, 0, 30)).toEqual(range(0, 8));
    expect(result.current.pendingCount).toBe(22);
  });
});
