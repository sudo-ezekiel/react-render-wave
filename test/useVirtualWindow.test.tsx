import { act, fireEvent, render } from "@testing-library/react";
import { StrictMode, useCallback, useRef } from "react";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { useVirtualWindow } from "../src/useVirtualWindow";
import type {
  UseVirtualWindowOptions,
  UseVirtualWindowResult,
} from "../src/useVirtualWindow";
import { MockResizeObserver } from "./setup";

// jsdom performs no layout. Heights are derived from inline styles so the
// hook sees a realistic viewport and content size. Copied from
// VirtualRenderWave.test.tsx so this file can run standalone.
beforeAll(() => {
  Object.defineProperty(HTMLElement.prototype, "clientHeight", {
    configurable: true,
    get(this: HTMLElement) {
      const px = parseFloat(this.style?.height ?? "");
      return Number.isFinite(px) ? px : 0;
    },
  });
  Object.defineProperty(HTMLElement.prototype, "scrollHeight", {
    configurable: true,
    get(this: HTMLElement) {
      let max = 0;
      for (const child of Array.from(this.children)) {
        const px = parseFloat((child as HTMLElement).style?.height ?? "");
        if (Number.isFinite(px)) max = Math.max(max, px);
      }
      if (max > 0) return max;
      const own = parseFloat(this.style?.height ?? "");
      return Number.isFinite(own) ? own : 0;
    },
  });
});

afterAll(() => {
  Reflect.deleteProperty(HTMLElement.prototype, "clientHeight");
  Reflect.deleteProperty(HTMLElement.prototype, "scrollHeight");
});

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

type HookRef = { current: UseVirtualWindowResult | null };

interface HarnessProps extends Omit<UseVirtualWindowOptions, "count"> {
  count: number;
  /** Height of the scroll container, in pixels. */
  height?: number;
  hookRef?: HookRef;
  /** Remounts the scroll container when it changes. */
  outerKey?: string;
  onRenderResult?: (result: UseVirtualWindowResult) => void;
}

function rows(v: UseVirtualWindowResult) {
  return v.virtualItems.map((it) => (
    <div
      key={it.key}
      ref={v.measureRef(it.index)}
      role="listitem"
      data-index={it.index}
      style={{ position: "absolute", top: it.offset }}
    >
      Item {it.index}
    </div>
  ));
}

function Harness({
  height = 400,
  hookRef,
  outerKey,
  onRenderResult,
  ...options
}: HarnessProps) {
  const v = useVirtualWindow(options);
  if (hookRef) hookRef.current = v;
  onRenderResult?.(v);
  return (
    <div
      key={outerKey}
      ref={v.scrollRef}
      style={{ height, overflowY: "auto", position: "relative" }}
    >
      <div style={{ height: v.totalSize, position: "relative" }}>{rows(v)}</div>
    </div>
  );
}

/** Same list, but the container is handed over through getScrollElement. */
function GetterHarness({ height = 400, hookRef, ...options }: HarnessProps) {
  const elRef = useRef<HTMLDivElement | null>(null);
  const getScrollElement = useCallback(() => elRef.current, []);
  const v = useVirtualWindow({ ...options, getScrollElement });
  if (hookRef) hookRef.current = v;
  return (
    <div
      ref={elRef}
      style={{ height, overflowY: "auto", position: "relative" }}
    >
      <div style={{ height: v.totalSize, position: "relative" }}>{rows(v)}</div>
    </div>
  );
}

const renderedIndexes = (container: HTMLElement) =>
  Array.from(container.querySelectorAll('[role="listitem"]')).map((el) =>
    Number(el.getAttribute("data-index"))
  );

const range = (from: number, to: number) =>
  Array.from({ length: to - from }, (_, i) => from + i);

const scrollTo = (el: HTMLElement, top: number) => {
  act(() => {
    el.scrollTop = top;
    el.dispatchEvent(new Event("scroll"));
    // Flush the animation frame that commits the new scroll position.
    vi.advanceTimersByTime(20);
  });
};

const rowObserver = () =>
  MockResizeObserver.instances.find((ro) =>
    Array.from(ro.observed).some((el) => el.getAttribute("role") === "listitem")
  );

const stubHeight = (el: Element, value: number) => {
  Object.defineProperty(el, "offsetHeight", { configurable: true, value });
};

const rowAt = (container: HTMLElement, index: number) =>
  container.querySelector(`[data-index="${index}"]`) as HTMLElement;

describe("useVirtualWindow", () => {
  it("renders the visible window plus overscan and moves it on scroll", () => {
    const hookRef: HookRef = { current: null };
    const { container } = render(
      <Harness count={1000} estimateSize={40} overscan={5} hookRef={hookRef} />
    );
    const scroller = container.firstElementChild as HTMLElement;

    expect(renderedIndexes(container)).toEqual(range(0, 15));
    expect(hookRef.current?.totalSize).toBe(40000);
    expect(hookRef.current?.visibleStart).toBe(0);
    expect(hookRef.current?.visibleEnd).toBe(10);

    scrollTo(scroller, 4000);

    expect(renderedIndexes(container)).toEqual(range(95, 115));
    expect(hookRef.current?.visibleStart).toBe(100);
    expect(hookRef.current?.visibleEnd).toBe(110);
  });

  it("takes the container from the getScrollElement option", () => {
    const hookRef: HookRef = { current: null };
    const { container } = render(
      <GetterHarness
        count={1000}
        estimateSize={40}
        overscan={5}
        hookRef={hookRef}
      />
    );
    const scroller = container.firstElementChild as HTMLElement;

    expect(hookRef.current?.getScrollElement()).toBe(scroller);
    expect(renderedIndexes(container)).toEqual(range(0, 15));

    scrollTo(scroller, 4000);
    expect(renderedIndexes(container)).toEqual(range(95, 115));
  });

  it("carries a measured size to the item's new index after a reorder", () => {
    const hookRef: HookRef = { current: null };
    const first = ["a", "b", "c"];
    const { container, rerender } = render(
      <Harness
        count={3}
        estimateSize={40}
        getItemKey={(i) => first[i]}
        hookRef={hookRef}
      />
    );

    stubHeight(rowAt(container, 0), 100);
    const observer = rowObserver();
    expect(observer).toBeDefined();
    act(() => {
      observer?.trigger([rowAt(container, 0)]);
    });

    expect(hookRef.current?.sizeOf(0)).toBe(100);
    expect(hookRef.current?.totalSize).toBe(180);

    const reversed = ["c", "b", "a"];
    rerender(
      <Harness
        count={3}
        estimateSize={40}
        getItemKey={(i) => reversed[i]}
        hookRef={hookRef}
      />
    );

    expect(hookRef.current?.sizeOf(0)).toBe(40);
    expect(hookRef.current?.sizeOf(2)).toBe(100);
    expect(hookRef.current?.offsetOf(2)).toBe(80);
    expect(hookRef.current?.totalSize).toBe(180);
  });

  it("measures with the measureSize option on both paths", () => {
    let firstSize = 70;
    const measureSize = vi.fn((el: HTMLElement) =>
      el.getAttribute("data-index") === "0" ? firstSize : 0
    );
    const hookRef: HookRef = { current: null };
    const { container } = render(
      <Harness
        count={100}
        estimateSize={40}
        measureSize={measureSize}
        hookRef={hookRef}
      />
    );

    // The commit pass.
    expect(measureSize).toHaveBeenCalled();
    expect(hookRef.current?.sizeOf(0)).toBe(70);
    expect(hookRef.current?.totalSize).toBe(70 + 99 * 40);
    expect(rowAt(container, 1).style.top).toBe("70px");

    // The observer pass.
    firstSize = 120;
    act(() => {
      rowObserver()?.trigger([rowAt(container, 0)]);
    });
    expect(hookRef.current?.sizeOf(0)).toBe(120);
    expect(hookRef.current?.totalSize).toBe(120 + 99 * 40);
  });

  it("opens at initialScrollOffset on the first render", () => {
    const onRangeChange = vi.fn();
    const hookRef: HookRef = { current: null };
    const { container } = render(
      <Harness
        count={1000}
        estimateSize={40}
        overscan={5}
        initialScrollOffset={2000}
        onRangeChange={onRangeChange}
        hookRef={hookRef}
      />
    );
    const scroller = container.firstElementChild as HTMLElement;

    expect(renderedIndexes(container)).toEqual(range(45, 65));
    expect(hookRef.current?.scrollOffset).toBe(2000);
    expect(scroller.scrollTop).toBe(2000);
    expect(onRangeChange).toHaveBeenCalledWith({
      start: 45,
      end: 65,
      visibleStart: 50,
      visibleEnd: 60,
    });
  });

  it("opens at initialScrollIndex and corrects it once items are measured", () => {
    const hookRef: HookRef = { current: null };
    const props = {
      count: 1000,
      estimateSize: 40,
      overscan: 40,
      initialScrollIndex: 50,
      hookRef,
    };
    const { container, rerender } = render(<Harness {...props} />);
    const scroller = container.firstElementChild as HTMLElement;

    expect(scroller.scrollTop).toBe(2000);
    expect(hookRef.current?.visibleStart).toBe(50);

    // An item above the target turns out 60px taller than the estimate.
    stubHeight(rowAt(container, 10), 100);
    act(() => {
      rerender(<Harness {...props} />);
    });

    expect(hookRef.current?.offsetOf(50)).toBe(2060);
    expect(scroller.scrollTop).toBe(2060);
    expect(hookRef.current?.scrollOffset).toBe(2060);
  });

  it("corrects initialScrollIndex under StrictMode too", () => {
    // StrictMode runs the attach effect's cleanup and body again on mount in
    // development. The correction target has to survive that, or the list
    // settles 60px above the item it was opened at.
    const hookRef: HookRef = { current: null };
    const props = {
      count: 1000,
      estimateSize: 40,
      overscan: 40,
      initialScrollIndex: 50,
      hookRef,
    };
    const { container, rerender } = render(
      <StrictMode>
        <Harness {...props} />
      </StrictMode>
    );
    const scroller = container.firstElementChild as HTMLElement;

    expect(scroller.scrollTop).toBe(2000);

    stubHeight(rowAt(container, 10), 100);
    act(() => {
      rerender(
        <StrictMode>
          <Harness {...props} />
        </StrictMode>
      );
    });

    expect(hookRef.current?.offsetOf(50)).toBe(2060);
    expect(scroller.scrollTop).toBe(2060);
  });

  it("aligns scrollToIndex to the start, centre, end or only when needed", () => {
    const hookRef: HookRef = { current: null };
    const { container } = render(
      <Harness count={1000} estimateSize={40} hookRef={hookRef} />
    );
    const scroller = container.firstElementChild as HTMLElement;

    act(() => hookRef.current?.scrollToIndex(50));
    expect(scroller.scrollTop).toBe(2000);

    act(() => hookRef.current?.scrollToIndex(50, { align: "center" }));
    expect(scroller.scrollTop).toBe(2000 - (400 - 40) / 2);

    act(() => hookRef.current?.scrollToIndex(50, { align: "end" }));
    expect(scroller.scrollTop).toBe(2000 + 40 - 400);

    // Back to the top, where index 3 is already fully visible.
    act(() => hookRef.current?.scrollToOffset(0));
    act(() => hookRef.current?.scrollToIndex(3, { align: "auto" }));
    expect(scroller.scrollTop).toBe(0);

    // Below the viewport: aligned to the end.
    act(() => hookRef.current?.scrollToIndex(20, { align: "auto" }));
    expect(scroller.scrollTop).toBe(800 + 40 - 400);

    // Above the viewport: aligned to the start.
    act(() => hookRef.current?.scrollToOffset(2000));
    act(() => hookRef.current?.scrollToIndex(10, { align: "auto" }));
    expect(scroller.scrollTop).toBe(400);
  });

  it("gives up correcting a target after five attempts", () => {
    // The target row reports a new size on every pass, so the offset it has
    // to be aligned to never stops moving.
    let grown = 40;
    let growths = 0;
    const measureSize = (el: HTMLElement) => {
      if (el.getAttribute("data-index") !== "50") return 0;
      if (growths < 8) {
        growths += 1;
        grown += 20;
      }
      return grown;
    };
    const hookRef: HookRef = { current: null };
    const props = {
      count: 1000,
      estimateSize: 40,
      overscan: 0,
      measureSize,
      hookRef,
    };
    const { container, rerender } = render(<Harness {...props} />);
    const scroller = container.firstElementChild as HTMLElement;

    act(() => hookRef.current?.scrollToIndex(50, { align: "end" }));

    // Five corrections, at sizes 60 through 140, then the target is dropped
    // even though the row keeps growing to 200.
    expect(grown).toBe(200);
    expect(scroller.scrollTop).toBe(2000 + 140 - 400);
    expect(hookRef.current?.sizeOf(50)).toBe(200);

    // Nothing is chasing the row any more: it keeps growing on its own.
    growths = 0;
    act(() => {
      rerender(<Harness {...props} />);
    });
    expect(hookRef.current?.sizeOf(50)).toBe(360);
    expect(scroller.scrollTop).toBe(2000 + 140 - 400);
  });

  it("reports scroll offsets once per frame and not on attach", () => {
    const onScroll = vi.fn();
    const { container } = render(
      <Harness count={1000} estimateSize={40} onScroll={onScroll} />
    );
    const scroller = container.firstElementChild as HTMLElement;
    expect(onScroll).not.toHaveBeenCalled();

    scrollTo(scroller, 1234);
    expect(onScroll).toHaveBeenCalledTimes(1);
    expect(onScroll).toHaveBeenLastCalledWith(1234);

    // Several events inside one frame report once, with the final offset.
    act(() => {
      scroller.scrollTop = 1500;
      scroller.dispatchEvent(new Event("scroll"));
      scroller.scrollTop = 1600;
      scroller.dispatchEvent(new Event("scroll"));
      vi.advanceTimersByTime(20);
    });
    expect(onScroll).toHaveBeenCalledTimes(2);
    expect(onScroll).toHaveBeenLastCalledWith(1600);
  });

  it("finishes a smooth target once the scrolling goes quiet", () => {
    const hookRef: HookRef = { current: null };
    const { container } = render(
      <Harness count={1000} estimateSize={40} hookRef={hookRef} />
    );
    const scroller = container.firstElementChild as HTMLElement;

    act(() => hookRef.current?.scrollToIndex(50, { behavior: "smooth" }));
    act(() => {
      vi.advanceTimersByTime(20);
    });
    expect(scroller.scrollTop).toBe(2000);
    expect(hookRef.current?.scrollOffset).toBe(2000);

    // An item above the target grows while the animation is still running.
    // Re-issuing now would fight the animation, so nothing moves yet.
    stubHeight(rowAt(container, 45), 100);
    act(() => {
      rowObserver()?.trigger([rowAt(container, 45)]);
    });
    expect(scroller.scrollTop).toBe(2000);

    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(scroller.scrollTop).toBe(2060);
    expect(hookRef.current?.scrollOffset).toBe(2060);
  });

  it("cancels a pending target when scrollToOffset is called", () => {
    const hookRef: HookRef = { current: null };
    const { container } = render(
      <Harness count={1000} estimateSize={40} hookRef={hookRef} />
    );
    const scroller = container.firstElementChild as HTMLElement;

    act(() => hookRef.current?.scrollToIndex(50, { align: "end" }));
    expect(scroller.scrollTop).toBe(1640);

    // The same position, but no longer tied to an item.
    act(() => hookRef.current?.scrollToOffset(1640));

    stubHeight(rowAt(container, 45), 100);
    act(() => {
      rowObserver()?.trigger([rowAt(container, 45)]);
    });

    expect(hookRef.current?.offsetOf(50)).toBe(2060);
    expect(scroller.scrollTop).toBe(1640);
  });

  it("drops a pending target when the user scrolls away", () => {
    const hookRef: HookRef = { current: null };
    const { container } = render(
      <Harness count={1000} estimateSize={40} hookRef={hookRef} />
    );
    const scroller = container.firstElementChild as HTMLElement;

    act(() => hookRef.current?.scrollToIndex(50, { align: "end" }));
    expect(scroller.scrollTop).toBe(1640);

    // A scroll that lands nowhere near the issued offset is the user.
    scrollTo(scroller, 1000);

    stubHeight(rowAt(container, 30), 100);
    act(() => {
      rowObserver()?.trigger([rowAt(container, 30)]);
    });

    // The item moved down by 60px, and the list did not chase it.
    expect(hookRef.current?.offsetOf(50)).toBe(2060);
    expect(scroller.scrollTop).toBe(1000);
  });

  it("drops a pending target on wheel input over the container", () => {
    const hookRef: HookRef = { current: null };
    const { container } = render(
      <Harness count={1000} estimateSize={40} hookRef={hookRef} />
    );
    const scroller = container.firstElementChild as HTMLElement;

    act(() => hookRef.current?.scrollToIndex(50, { align: "end" }));
    expect(scroller.scrollTop).toBe(1640);

    fireEvent.wheel(scroller);

    stubHeight(rowAt(container, 45), 100);
    act(() => {
      rowObserver()?.trigger([rowAt(container, 45)]);
    });

    // Without the wheel the target would have been re-issued at 1700.
    expect(hookRef.current?.offsetOf(50)).toBe(2060);
    expect(scroller.scrollTop).toBe(1640);
  });

  describe("onRangeChange", () => {
    it("reports on mount, on a move, and not on a no-op rerender", () => {
      const onRangeChange = vi.fn();
      const props = {
        count: 1000,
        estimateSize: 40,
        overscan: 5,
        onRangeChange,
      };
      const { container, rerender } = render(<Harness {...props} />);
      const scroller = container.firstElementChild as HTMLElement;

      expect(onRangeChange).toHaveBeenCalledTimes(1);
      expect(onRangeChange).toHaveBeenLastCalledWith({
        start: 0,
        end: 15,
        visibleStart: 0,
        visibleEnd: 10,
      });

      rerender(<Harness {...props} />);
      expect(onRangeChange).toHaveBeenCalledTimes(1);

      scrollTo(scroller, 4000);
      expect(onRangeChange).toHaveBeenCalledTimes(2);
      expect(onRangeChange).toHaveBeenLastCalledWith({
        start: 95,
        end: 115,
        visibleStart: 100,
        visibleEnd: 110,
      });
    });

    it("reports once on mount when the rows measure taller than the estimate", () => {
      // Nothing delivers a ResizeObserver entry: the rows are measured by the
      // commit pass, which suppresses the report of the range it measured. The
      // settled range still has to be announced, and exactly once.
      const offsetHeight = Object.getOwnPropertyDescriptor(
        HTMLElement.prototype,
        "offsetHeight"
      );
      Object.defineProperty(HTMLElement.prototype, "offsetHeight", {
        configurable: true,
        get(this: HTMLElement) {
          return this.getAttribute("role") === "listitem" ? 90 : 0;
        },
      });

      try {
        const onRangeChange = vi.fn();
        render(
          <Harness
            count={1000}
            estimateSize={40}
            overscan={5}
            onRangeChange={onRangeChange}
          />
        );

        // 90px rows: four of them fit in 400px, indexAt(399) is 4.
        expect(onRangeChange).toHaveBeenCalledTimes(1);
        expect(onRangeChange).toHaveBeenLastCalledWith({
          start: 0,
          end: 10,
          visibleStart: 0,
          visibleEnd: 5,
        });
      } finally {
        if (offsetHeight) {
          Object.defineProperty(
            HTMLElement.prototype,
            "offsetHeight",
            offsetHeight
          );
        } else {
          Reflect.deleteProperty(HTMLElement.prototype, "offsetHeight");
        }
      }
    });

    it("reports on mount when measuring leaves the range where it was", () => {
      // The rows measure exactly the estimate. The commit pass still records
      // the sizes and suppresses its report, and the re-render that follows
      // lands on the same four bounds, so nothing but the heights version
      // tells this effect it has a report still owed.
      const offsetHeight = Object.getOwnPropertyDescriptor(
        HTMLElement.prototype,
        "offsetHeight"
      );
      Object.defineProperty(HTMLElement.prototype, "offsetHeight", {
        configurable: true,
        get(this: HTMLElement) {
          return this.getAttribute("role") === "listitem" ? 40 : 0;
        },
      });

      try {
        const onRangeChange = vi.fn();
        render(
          <Harness
            count={1000}
            estimateSize={40}
            overscan={5}
            onRangeChange={onRangeChange}
          />
        );

        expect(onRangeChange).toHaveBeenCalledTimes(1);
        expect(onRangeChange).toHaveBeenLastCalledWith({
          start: 0,
          end: 15,
          visibleStart: 0,
          visibleEnd: 10,
        });
      } finally {
        if (offsetHeight) {
          Object.defineProperty(
            HTMLElement.prototype,
            "offsetHeight",
            offsetHeight
          );
        } else {
          Reflect.deleteProperty(HTMLElement.prototype, "offsetHeight");
        }
      }
    });

    it("stays quiet on mount for an empty list", () => {
      const onRangeChange = vi.fn();
      render(
        <Harness count={0} estimateSize={40} onRangeChange={onRangeChange} />
      );
      expect(onRangeChange).not.toHaveBeenCalled();
    });

    it("reports once on mount under StrictMode", () => {
      const onRangeChange = vi.fn();
      render(
        <StrictMode>
          <Harness
            count={1000}
            estimateSize={40}
            overscan={5}
            onRangeChange={onRangeChange}
          />
        </StrictMode>
      );
      expect(onRangeChange).toHaveBeenCalledTimes(1);
    });
  });

  it("offsets the window and scroll targets by scrollMargin", () => {
    const hookRef: HookRef = { current: null };
    const { container } = render(
      <Harness
        count={1000}
        estimateSize={40}
        overscan={5}
        scrollMargin={100}
        hookRef={hookRef}
      />
    );
    const scroller = container.firstElementChild as HTMLElement;

    expect(hookRef.current?.visibleStart).toBe(0);
    expect(hookRef.current?.start).toBe(0);

    scrollTo(scroller, 500);
    expect(hookRef.current?.visibleStart).toBe(10);

    act(() => hookRef.current?.scrollToIndex(50));
    expect(scroller.scrollTop).toBe(2100);
  });

  it("keeps every returned function stable across rerenders", () => {
    const hookRef: HookRef = { current: null };
    const props = { count: 100, estimateSize: 40, hookRef };
    const { rerender } = render(<Harness {...props} />);
    const before = hookRef.current!;

    rerender(<Harness {...props} count={200} />);
    const after = hookRef.current!;

    expect(after).not.toBe(before);
    expect(after.scrollRef).toBe(before.scrollRef);
    expect(after.measureRef).toBe(before.measureRef);
    expect(after.scrollToIndex).toBe(before.scrollToIndex);
    expect(after.scrollToOffset).toBe(before.scrollToOffset);
    expect(after.offsetOf).toBe(before.offsetOf);
    expect(after.sizeOf).toBe(before.sizeOf);
    expect(after.indexAt).toBe(before.indexAt);
    expect(after.getScrollElement).toBe(before.getScrollElement);
    expect(after.measureRef(3)).toBe(before.measureRef(3));
  });

  it("moves its listeners when the container element is swapped", () => {
    const hookRef: HookRef = { current: null };
    const props = { count: 1000, estimateSize: 40, overscan: 5, hookRef };
    const { container, rerender } = render(<Harness {...props} outerKey="a" />);
    const oldScroller = container.firstElementChild as HTMLElement;

    scrollTo(oldScroller, 4000);
    expect(renderedIndexes(container)).toEqual(range(95, 115));

    rerender(<Harness {...props} outerKey="b" />);
    const newScroller = container.firstElementChild as HTMLElement;
    expect(newScroller).not.toBe(oldScroller);
    expect(hookRef.current?.getScrollElement()).toBe(newScroller);
    // The new container starts at the top, and the window follows it.
    expect(renderedIndexes(container)).toEqual(range(0, 15));

    scrollTo(newScroller, 4000);
    expect(renderedIndexes(container)).toEqual(range(95, 115));

    scrollTo(oldScroller, 0);
    expect(renderedIndexes(container)).toEqual(range(95, 115));
  });
});
