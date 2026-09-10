import { act, renderHook } from "@testing-library/react";
import { StrictMode, type ReactNode } from "react";
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

describe("useViewportReveal", () => {
  it("reveals the first batch of the window during the first render", () => {
    const { result } = renderHook(() =>
      useViewportReveal({ count: 1000, start: 0, end: 15, batchSize: 5 })
    );
    expect(revealedIn(result.current.isRevealed, 0, 15)).toEqual(range(0, 5));
    expect(result.current.pendingCount).toBe(10);
  });

  it("reveals one batch per wave until the window is full", () => {
    const { result } = renderHook(() =>
      useViewportReveal({
        count: 1000,
        start: 0,
        end: 15,
        batchSize: 5,
        interval: 50,
      })
    );

    advanceWave();
    expect(revealedIn(result.current.isRevealed, 0, 15)).toEqual(range(0, 10));
    expect(result.current.pendingCount).toBe(5);

    advanceWave();
    expect(revealedIn(result.current.isRevealed, 0, 15)).toEqual(range(0, 15));
    expect(result.current.pendingCount).toBe(0);

    // Nothing left to reveal in this window, so nothing stays armed.
    expect(vi.getTimerCount()).toBe(0);
  });

  it("keeps rows revealed when the window moves and picks up the new ones", () => {
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
    expect(revealedIn(result.current.isRevealed, 0, 15)).toEqual(range(0, 15));
    expect(result.current.pendingCount).toBe(15);

    advanceWave();
    expect(revealedIn(result.current.isRevealed, 100, 115)).toEqual(
      range(100, 105)
    );
    expect(revealedIn(result.current.isRevealed, 0, 15)).toEqual(range(0, 15));
  });

  it("does not restart the pending wave when the window moves", () => {
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

    advanceWave(30);
    rerender({ count: 1000, start: 100, end: 115, batchSize: 5, interval: 50 });
    expect(result.current.isRevealed(100)).toBe(false);

    // 70ms in total: past the wave armed on the first render, well short of
    // the 80ms a wave re-armed by the move would have taken.
    advanceWave(40);
    expect(revealedIn(result.current.isRevealed, 100, 115)).toEqual(
      range(100, 105)
    );
  });

  it("tracks revealed rows by key when getItemKey is given", () => {
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
        },
      }
    );
    expect(revealedIn(result.current.isRevealed, 0, 6)).toEqual([0, 1]);

    // The list is reversed: "a" and "b" now sit at the end of it.
    const reversed = [...order].reverse();
    rerender({
      count: 6,
      start: 0,
      end: 6,
      batchSize: 2,
      getItemKey: (index: number) => reversed[index],
    });
    expect(revealedIn(result.current.isRevealed, 0, 6)).toEqual([4, 5]);
    expect(result.current.pendingCount).toBe(4);

    advanceWave();
    expect(revealedIn(result.current.isRevealed, 0, 6)).toEqual([0, 1, 4, 5]);
  });

  it("never reveals rows below startIndex", () => {
    const { result } = renderHook(() =>
      useViewportReveal({
        count: 100,
        start: 0,
        end: 15,
        batchSize: 5,
        startIndex: 5,
      })
    );
    expect(revealedIn(result.current.isRevealed, 0, 15)).toEqual(range(5, 10));
    expect(result.current.pendingCount).toBe(5);

    advanceWave();
    expect(revealedIn(result.current.isRevealed, 0, 15)).toEqual(range(5, 15));
    expect(result.current.pendingCount).toBe(0);
  });

  it("pauses while enabled is false and resumes without losing state", () => {
    const { result, rerender } = renderHook(
      (props: UseViewportRevealOptions) => useViewportReveal(props),
      {
        initialProps: {
          count: 1000,
          start: 0,
          end: 15,
          batchSize: 5,
          enabled: false,
        },
      }
    );
    expect(revealedIn(result.current.isRevealed, 0, 15)).toEqual(range(0, 5));
    advanceWave();
    advanceWave();
    expect(revealedIn(result.current.isRevealed, 0, 15)).toEqual(range(0, 5));
    expect(vi.getTimerCount()).toBe(0);

    rerender({ count: 1000, start: 0, end: 15, batchSize: 5, enabled: true });
    advanceWave();
    expect(revealedIn(result.current.isRevealed, 0, 15)).toEqual(range(0, 10));
  });

  it("re-primes the first batch after reset", () => {
    const { result } = renderHook(() =>
      useViewportReveal({ count: 1000, start: 0, end: 15, batchSize: 5 })
    );
    advanceWave();
    advanceWave();
    expect(result.current.pendingCount).toBe(0);

    act(() => {
      result.current.reset();
    });
    expect(revealedIn(result.current.isRevealed, 0, 15)).toEqual(range(0, 5));
    expect(result.current.pendingCount).toBe(10);

    advanceWave();
    expect(revealedIn(result.current.isRevealed, 0, 15)).toEqual(range(0, 10));
  });

  it("primes the first batch when the data arrives after the first render", () => {
    // The list renders empty while its data is in flight. Priming only on the
    // first render would prime nothing, and the rows that do arrive would sit
    // blank for a whole interval.
    const { result, rerender } = renderHook(
      (props: UseViewportRevealOptions) => useViewportReveal(props),
      { initialProps: { count: 0, start: 0, end: 0, batchSize: 5 } }
    );
    expect(result.current.pendingCount).toBe(0);

    rerender({ count: 100, start: 0, end: 15, batchSize: 5 });

    expect(revealedIn(result.current.isRevealed, 0, 15)).toEqual(range(0, 5));
    expect(result.current.pendingCount).toBe(10);
  });

  it("reveals a window shorter than one batch in full on the first render", () => {
    const { result } = renderHook(() =>
      useViewportReveal({ count: 3, start: 0, end: 3, batchSize: 5 })
    );
    expect(revealedIn(result.current.isRevealed, 0, 3)).toEqual([0, 1, 2]);
    expect(result.current.pendingCount).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("schedules nothing for an empty list", () => {
    const { result } = renderHook(() =>
      useViewportReveal({ count: 0, start: 0, end: 0 })
    );
    expect(result.current.pendingCount).toBe(0);
    expect(result.current.isRevealed(0)).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("reveals one batch, not two, under StrictMode", () => {
    const { result } = renderHook(
      () => useViewportReveal({ count: 1000, start: 0, end: 15, batchSize: 5 }),
      {
        wrapper: ({ children }: { children: ReactNode }) => (
          <StrictMode>{children}</StrictMode>
        ),
      }
    );
    expect(revealedIn(result.current.isRevealed, 0, 15)).toEqual(range(0, 5));
    expect(result.current.pendingCount).toBe(10);
  });

  it("keeps isRevealed and reset referentially stable", () => {
    const { result, rerender } = renderHook(
      (props: UseViewportRevealOptions) => useViewportReveal(props),
      { initialProps: { count: 1000, start: 0, end: 15, batchSize: 5 } }
    );
    const { isRevealed, reset } = result.current;

    rerender({ count: 1000, start: 10, end: 25, batchSize: 5 });
    advanceWave();
    expect(result.current.isRevealed).toBe(isRevealed);
    expect(result.current.reset).toBe(reset);
  });
});
