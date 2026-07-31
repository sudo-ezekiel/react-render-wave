import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useRenderWave } from "../src/useRenderWave";

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

describe("useRenderWave", () => {
  it("reveals the first batch immediately", () => {
    const { result } = renderHook(() =>
      useRenderWave({ length: 100, batchSize: 20 })
    );
    expect(result.current.count).toBe(20);
    expect(result.current.indexes).toEqual(
      Array.from({ length: 20 }, (_, i) => i)
    );
    expect(result.current.isComplete).toBe(false);
  });

  it("never exceeds the list length on the first render", () => {
    const { result } = renderHook(() =>
      useRenderWave({ length: 5, batchSize: 20 })
    );
    expect(result.current.count).toBe(5);
    expect(result.current.indexes).toEqual([0, 1, 2, 3, 4]);
    expect(result.current.isComplete).toBe(true);
  });

  it("reveals one batch per interval until complete", () => {
    const { result } = renderHook(() =>
      useRenderWave({ length: 100, batchSize: 30, interval: 50 })
    );
    expect(result.current.count).toBe(30);
    advanceWave();
    expect(result.current.count).toBe(60);
    advanceWave();
    expect(result.current.count).toBe(90);
    advanceWave();
    expect(result.current.count).toBe(100);
    expect(result.current.isComplete).toBe(true);
    advanceWave();
    expect(result.current.count).toBe(100);
  });

  it("respects startIndex", () => {
    const { result } = renderHook(() =>
      useRenderWave({ length: 10, batchSize: 2, startIndex: 4 })
    );
    expect(result.current.indexes).toEqual([4, 5]);
    advanceWave();
    expect(result.current.indexes).toEqual([4, 5, 6, 7]);
    advanceWave();
    advanceWave();
    expect(result.current.count).toBe(6);
    expect(result.current.isComplete).toBe(true);
  });

  it("clamps immediately when the list shrinks", () => {
    const { result, rerender } = renderHook(
      ({ length }) => useRenderWave({ length, batchSize: 20 }),
      { initialProps: { length: 100 } }
    );
    advanceWave();
    expect(result.current.count).toBe(40);

    rerender({ length: 10 });
    expect(result.current.count).toBe(10);
    expect(result.current.isComplete).toBe(true);
  });

  it("resumes revealing when the list grows", () => {
    const onComplete = vi.fn();
    const { result, rerender } = renderHook(
      ({ length }) => useRenderWave({ length, batchSize: 20, onComplete }),
      { initialProps: { length: 30 } }
    );
    advanceWave();
    expect(result.current.isComplete).toBe(true);
    expect(onComplete).toHaveBeenCalledTimes(1);

    rerender({ length: 80 });
    expect(result.current.isComplete).toBe(false);
    advanceWave();
    advanceWave();
    expect(result.current.count).toBe(80);
    expect(onComplete).toHaveBeenCalledTimes(2);
  });

  it("calls onComplete once per completion", () => {
    const onComplete = vi.fn();
    const { result } = renderHook(() =>
      useRenderWave({ length: 40, batchSize: 20, onComplete })
    );
    expect(onComplete).not.toHaveBeenCalled();
    advanceWave();
    expect(result.current.isComplete).toBe(true);
    expect(onComplete).toHaveBeenCalledTimes(1);
    advanceWave();
    advanceWave();
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it("pauses when enabled is false", () => {
    const { result, rerender } = renderHook(
      ({ enabled }) => useRenderWave({ length: 100, batchSize: 20, enabled }),
      { initialProps: { enabled: false } }
    );
    expect(result.current.count).toBe(20);
    advanceWave();
    advanceWave();
    expect(result.current.count).toBe(20);

    rerender({ enabled: true });
    advanceWave();
    expect(result.current.count).toBe(40);
  });

  it("restarts from the first batch on reset", () => {
    const { result } = renderHook(() =>
      useRenderWave({ length: 60, batchSize: 20 })
    );
    advanceWave();
    advanceWave();
    expect(result.current.isComplete).toBe(true);

    act(() => {
      result.current.reset();
    });
    expect(result.current.count).toBe(20);
    expect(result.current.isComplete).toBe(false);
    advanceWave();
    expect(result.current.count).toBe(40);
  });

  it("handles an empty list", () => {
    const { result } = renderHook(() => useRenderWave({ length: 0 }));
    expect(result.current.count).toBe(0);
    expect(result.current.indexes).toEqual([]);
    expect(result.current.isComplete).toBe(true);
  });

  it("keeps the indexes array referentially stable between renders without reveals", () => {
    const { result, rerender } = renderHook(() =>
      useRenderWave({ length: 100, batchSize: 20 })
    );
    const first = result.current.indexes;
    rerender();
    expect(result.current.indexes).toBe(first);
  });
});
