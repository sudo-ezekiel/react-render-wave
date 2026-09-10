import { act, render } from "@testing-library/react";
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
// useVirtualWindow.test.tsx so this file can run standalone.
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
  /** Skips rendering the scroll container entirely while false. */
  attach?: boolean;
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
  attach = true,
  ...options
}: HarnessProps) {
  const v = useVirtualWindow(options);
  if (hookRef) hookRef.current = v;
  if (!attach) return <div style={{ height }} />;
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

const renderedIndexes = (container: HTMLElement) =>
  Array.from(container.querySelectorAll('[role="listitem"]')).map((el) =>
    Number(el.getAttribute("data-index"))
  );

const range = (from: number, to: number) =>
  Array.from({ length: to - from }, (_, i) => from + i);

const rowObserver = () =>
  MockResizeObserver.instances.find((ro) =>
    Array.from(ro.observed).some((el) => el.getAttribute("role") === "listitem")
  );

const stubHeight = (el: Element, value: number) => {
  Object.defineProperty(el, "offsetHeight", { configurable: true, value });
};

const rowAt = (container: HTMLElement, index: number) =>
  container.querySelector(`[data-index="${index}"]`) as HTMLElement;

describe("useVirtualWindow edges", () => {
  it("stores a scrollToIndex issued before attach and applies it once the container arrives", () => {
    const hookRef: HookRef = { current: null };
    const { container, rerender } = render(
      <Harness
        count={1000}
        estimateSize={40}
        attach={false}
        hookRef={hookRef}
      />
    );

    act(() => hookRef.current?.scrollToIndex(50));

    rerender(
      <Harness count={1000} estimateSize={40} attach hookRef={hookRef} />
    );
    const scroller = container.firstElementChild as HTMLElement;

    expect(scroller.scrollTop).toBe(2000);
  });

  it("reports onRangeChange for count 1000 -> 0, stays quiet at 0, then reports again for 0 -> 100", () => {
    const shrinkSpy = vi.fn();
    const { rerender: rerenderShrink } = render(
      <Harness
        count={1000}
        estimateSize={40}
        overscan={5}
        onRangeChange={shrinkSpy}
      />
    );
    shrinkSpy.mockClear();
    rerenderShrink(
      <Harness
        count={0}
        estimateSize={40}
        overscan={5}
        onRangeChange={shrinkSpy}
      />
    );
    expect(shrinkSpy).toHaveBeenCalledWith({
      start: 0,
      end: 0,
      visibleStart: 0,
      visibleEnd: 0,
    });

    const growSpy = vi.fn();
    const { rerender: rerenderGrow } = render(
      <Harness
        count={0}
        estimateSize={40}
        overscan={5}
        onRangeChange={growSpy}
      />
    );
    expect(growSpy).not.toHaveBeenCalled();
    rerenderGrow(
      <Harness
        count={100}
        estimateSize={40}
        overscan={5}
        onRangeChange={growSpy}
      />
    );
    expect(growSpy).toHaveBeenCalledWith({
      start: 0,
      end: 15,
      visibleStart: 0,
      visibleEnd: 10,
    });
  });

  it("drops a pending target when the count shrinks below its index, so a later measurement does not chase it", () => {
    const hookRef: HookRef = { current: null };
    const { container, rerender } = render(
      <Harness count={1000} estimateSize={40} overscan={5} hookRef={hookRef} />
    );
    const scroller = container.firstElementChild as HTMLElement;

    act(() => hookRef.current?.scrollToIndex(900));
    expect(scroller.scrollTop).toBe(36000);

    rerender(
      <Harness count={100} estimateSize={40} overscan={5} hookRef={hookRef} />
    );

    // Row 95 is inside the rendered window for the shrunk list.
    stubHeight(rowAt(container, 95), 100);
    act(() => {
      rowObserver()?.trigger([rowAt(container, 95)]);
    });

    expect(scroller.scrollTop).toBe(36000);
    expect(hookRef.current?.scrollOffset).toBe(36000);
  });

  it("clears a pending target and moves its listeners when the container element is swapped", () => {
    const hookRef: HookRef = { current: null };
    const { container, rerender } = render(
      <Harness
        count={1000}
        estimateSize={40}
        overscan={5}
        outerKey="a"
        hookRef={hookRef}
      />
    );
    const oldScroller = container.firstElementChild as HTMLElement;

    act(() => hookRef.current?.scrollToIndex(500));
    expect(oldScroller.scrollTop).toBe(20000);

    rerender(
      <Harness
        count={1000}
        estimateSize={40}
        overscan={5}
        outerKey="b"
        hookRef={hookRef}
      />
    );
    const newScroller = container.firstElementChild as HTMLElement;
    expect(newScroller).not.toBe(oldScroller);
    expect(renderedIndexes(container)).toEqual(range(0, 15));

    act(() => {
      oldScroller.scrollTop = 9999;
      oldScroller.dispatchEvent(new Event("scroll"));
      vi.advanceTimersByTime(20);
    });

    expect(renderedIndexes(container)).toEqual(range(0, 15));
    expect(hookRef.current?.scrollOffset).toBe(0);
  });

  it("aligns scrollToIndex to center and end with a scrollMargin offset", () => {
    const hookRef: HookRef = { current: null };
    const { container } = render(
      <Harness
        count={1000}
        estimateSize={40}
        scrollMargin={100}
        hookRef={hookRef}
      />
    );
    const scroller = container.firstElementChild as HTMLElement;

    act(() => hookRef.current?.scrollToIndex(50, { align: "center" }));
    expect(scroller.scrollTop).toBe(1920);

    act(() => hookRef.current?.scrollToIndex(50, { align: "end" }));
    expect(scroller.scrollTop).toBe(1740);
  });

  it("accumulates fractional measured sizes exactly through both the layout pass and the observer path", () => {
    const offsetHeight = Object.getOwnPropertyDescriptor(
      HTMLElement.prototype,
      "offsetHeight"
    );
    Object.defineProperty(HTMLElement.prototype, "offsetHeight", {
      configurable: true,
      get(this: HTMLElement) {
        return this.getAttribute("role") === "listitem" ? 40.5 : 0;
      },
    });

    try {
      const hookRef: HookRef = { current: null };
      const { container } = render(
        <Harness count={100} estimateSize={40} overscan={5} hookRef={hookRef} />
      );

      // Layout pass: rows 0..9 all measured at 40.5 on mount.
      expect(hookRef.current?.offsetOf(10)).toBe(405);

      // Observer path: row 0 reports a different fractional size.
      stubHeight(rowAt(container, 0), 50.25);
      act(() => {
        rowObserver()?.trigger([rowAt(container, 0)]);
      });

      expect(hookRef.current?.sizeOf(0)).toBe(50.25);
      expect(hookRef.current?.offsetOf(10)).toBe(414.75);
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

  it("renders exactly the visible rows with overscan 0, and a 0 viewport renders one row plus overscan without throwing", () => {
    const hookRef: HookRef = { current: null };
    const { container } = render(
      <Harness count={1000} estimateSize={40} overscan={0} hookRef={hookRef} />
    );
    expect(renderedIndexes(container)).toEqual(range(0, 10));

    const zeroHookRef: HookRef = { current: null };
    expect(() =>
      render(
        <Harness
          count={1000}
          estimateSize={40}
          overscan={5}
          height={0}
          initialViewportSize={0}
          hookRef={zeroHookRef}
        />
      )
    ).not.toThrow();
    expect(zeroHookRef.current?.viewportSize).toBe(0);
  });

  it("cancels a smooth scroll correction on a user wheel event, so a later measurement does not move it", () => {
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

    scroller.dispatchEvent(new Event("wheel"));

    act(() => {
      vi.advanceTimersByTime(200);
    });

    stubHeight(rowAt(container, 45), 100);
    act(() => {
      rowObserver()?.trigger([rowAt(container, 45)]);
    });

    expect(scroller.scrollTop).toBe(2000);
  });

  it("carries measured sizes by key and drops exactly the removed item's size when a reorder removes an item along with a count change", () => {
    const before = ["a", "b", "c", "d", "e", "f", "g", "h", "i", "j"];
    const hookRef: HookRef = { current: null };
    const { container, rerender } = render(
      <Harness
        count={10}
        estimateSize={40}
        getItemKey={(i) => before[i]}
        hookRef={hookRef}
      />
    );

    stubHeight(rowAt(container, 0), 100);
    stubHeight(rowAt(container, 4), 70);
    const observer = rowObserver();
    act(() => {
      observer?.trigger([rowAt(container, 0), rowAt(container, 4)]);
    });

    expect(hookRef.current?.totalSize).toBe(490);

    const after = ["b", "c", "d", "e", "f", "g", "h", "i", "j"];
    rerender(
      <Harness
        count={9}
        estimateSize={40}
        getItemKey={(i) => after[i]}
        hookRef={hookRef}
      />
    );

    expect(hookRef.current?.sizeOf(3)).toBe(70); // "e" carried its measured size
    expect(hookRef.current?.totalSize).toBe(390);
  });

  it("keeps every measured size when getItemKey changes identity but keeps the same mapping", () => {
    const keys = Array.from({ length: 20 }, (_, i) => `k${i}`);
    const keyFnA = (i: number) => keys[i];
    const hookRef: HookRef = { current: null };
    const { container, rerender } = render(
      <Harness
        count={20}
        estimateSize={40}
        getItemKey={keyFnA}
        hookRef={hookRef}
      />
    );

    stubHeight(rowAt(container, 0), 100);
    act(() => {
      rowObserver()?.trigger([rowAt(container, 0)]);
    });
    expect(hookRef.current?.offsetOf(1)).toBe(100);

    const keyFnB = (i: number) => keys[i];
    rerender(
      <Harness
        count={20}
        estimateSize={40}
        getItemKey={keyFnB}
        hookRef={hookRef}
      />
    );

    expect(hookRef.current?.sizeOf(0)).toBe(100);
    expect(hookRef.current?.offsetOf(1)).toBe(100);
  });

  it("gives every virtualItems entry a key, offset and size consistent with offsetOf/sizeOf", () => {
    const hookRef: HookRef = { current: null };
    render(
      <Harness
        count={1000}
        estimateSize={40}
        overscan={5}
        getItemKey={(i) => `item-${i}`}
        hookRef={hookRef}
      />
    );

    const result = hookRef.current!;
    expect(result.virtualItems.length).toBe(result.end - result.start);
    for (const item of result.virtualItems) {
      expect(item.key).toBe(`item-${item.index}`);
      expect(item.offset).toBe(result.offsetOf(item.index));
      expect(item.size).toBe(result.sizeOf(item.index));
    }
  });

  it("resolves indexAt boundaries correctly through the hook once rows have mixed measured sizes", () => {
    const hookRef: HookRef = { current: null };
    const { container } = render(
      <Harness count={1000} estimateSize={40} hookRef={hookRef} />
    );

    stubHeight(rowAt(container, 0), 100);
    stubHeight(rowAt(container, 1), 50);
    stubHeight(rowAt(container, 2), 25);
    act(() => {
      rowObserver()?.trigger([
        rowAt(container, 0),
        rowAt(container, 1),
        rowAt(container, 2),
      ]);
    });

    expect(hookRef.current?.indexAt(99)).toBe(0);
    expect(hookRef.current?.indexAt(100)).toBe(1);
    expect(hookRef.current?.indexAt(149)).toBe(1);
    expect(hookRef.current?.indexAt(150)).toBe(2);
    expect(hookRef.current?.indexAt(175)).toBe(3);
  });

  it("does not call onScroll on attach or for a programmatic instant scroll, since jsdom never fires a scroll event from a scrollTop write", () => {
    const onScroll = vi.fn();
    const hookRef: HookRef = { current: null };
    const { container } = render(
      <Harness
        count={1000}
        estimateSize={40}
        onScroll={onScroll}
        hookRef={hookRef}
      />
    );
    const scroller = container.firstElementChild as HTMLElement;
    expect(onScroll).not.toHaveBeenCalled();

    act(() => hookRef.current?.scrollToIndex(50));
    expect(scroller.scrollTop).toBe(2000);
    expect(onScroll).not.toHaveBeenCalled();

    // A real scroll event still reports once per animation frame.
    act(() => {
      scroller.dispatchEvent(new Event("scroll"));
      vi.advanceTimersByTime(20);
    });
    expect(onScroll).toHaveBeenCalledTimes(1);
    expect(onScroll).toHaveBeenLastCalledWith(2000);
  });
});
