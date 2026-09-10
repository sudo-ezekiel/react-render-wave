import { act, fireEvent, render } from "@testing-library/react";
import { StrictMode, forwardRef } from "react";
import { renderToString } from "react-dom/server";
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
import { VirtualRenderWave } from "../src/VirtualRenderWave";
import { useVirtualWindow } from "../src/useVirtualWindow";
import type {
  UseVirtualWindowOptions,
  UseVirtualWindowResult,
} from "../src/useVirtualWindow";
import type { WrapperProps } from "../src/types";
import { MockResizeObserver } from "./setup";

// jsdom performs no layout, so heights come from inline styles.
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

const items = (n: number) => Array.from({ length: n }, (_, i) => `Item ${i}`);

const scrollTo = (el: HTMLElement, top: number) => {
  act(() => {
    el.scrollTop = top;
    el.dispatchEvent(new Event("scroll"));
    // Flush the animation frame that commits the new scroll position.
    vi.advanceTimersByTime(20);
  });
};

type HookRef = { current: UseVirtualWindowResult | null };

interface HarnessProps extends Omit<UseVirtualWindowOptions, "count"> {
  count: number;
  height?: number;
  hookRef?: HookRef;
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

function Harness({ height = 400, hookRef, ...options }: HarnessProps) {
  const v = useVirtualWindow(options);
  if (hookRef) hookRef.current = v;
  return (
    <div
      ref={v.scrollRef}
      style={{ height, overflowY: "auto", position: "relative" }}
    >
      <div style={{ height: v.totalSize, position: "relative" }}>{rows(v)}</div>
    </div>
  );
}

const stubHeight = (el: Element, value: number) => {
  Object.defineProperty(el, "offsetHeight", { configurable: true, value });
};

const rowObserver = () =>
  MockResizeObserver.instances.find((ro) =>
    Array.from(ro.observed).some((el) => el.getAttribute("role") === "listitem")
  );

describe("react-render-wave 3.1.0 regression tests", () => {
  describe("a wrapper that swallows the ref", () => {
    const RefLosingSection = forwardRef<HTMLElement, WrapperProps>(
      function RefLosingSection({ children, ...rest }, _ref) {
        return <section {...rest}>{children}</section>;
      }
    );

    const REF_LOST_MESSAGE =
      "react-render-wave: outerElement did not attach the ref it received, so " +
      "the list cannot scroll or measure. On React 18 wrap the component in " +
      "forwardRef and pass the ref to your DOM node.";

    it("reports a ref-swallowing outerElement once even under StrictMode", () => {
      const errors = vi.spyOn(console, "error").mockImplementation(() => {});
      try {
        render(
          <StrictMode>
            <VirtualRenderWave
              items={items(1000)}
              itemHeight={40}
              containerHeight={400}
              overscan={5}
              batchSize={1000}
              outerElement={RefLosingSection}
              renderItem={(item) => <div>{item}</div>}
            />
          </StrictMode>
        );

        const ours = errors.mock.calls.filter((call) =>
          String(call[0]).includes("outerElement did not attach the ref")
        );
        expect(ours).toHaveLength(1);
        expect(ours[0][0]).toBe(REF_LOST_MESSAGE);
      } finally {
        errors.mockRestore();
      }
    });
  });

  it("initialScrollIndex's first render already includes scrollMargin in its window", () => {
    const onRangeChange = vi.fn();
    const hookRef: HookRef = { current: null };
    const { container } = render(
      <Harness
        count={1000}
        estimateSize={40}
        overscan={5}
        scrollMargin={600}
        initialScrollIndex={100}
        initialViewportSize={400}
        onRangeChange={onRangeChange}
        hookRef={hookRef}
      />
    );
    const scroller = container.firstElementChild as HTMLElement;

    // The very first render (what renderToString would emit, and what paints
    // before the client-only attach effect corrects it) should already window
    // around index 100, not 80.
    expect(hookRef.current?.start).toBe(95);
    expect(hookRef.current?.end).toBe(115);
    expect(hookRef.current?.visibleStart).toBe(100);
    expect(hookRef.current?.visibleEnd).toBe(110);
    expect(hookRef.current?.scrollOffset).toBe(4600);
    expect(scroller.scrollTop).toBe(4600);
    expect(onRangeChange).toHaveBeenCalledTimes(1);
    expect(onRangeChange).toHaveBeenLastCalledWith({
      start: 95,
      end: 115,
      visibleStart: 100,
      visibleEnd: 110,
    });
  });

  it("scrollToIndex near the end of the list lands on the target item", () => {
    const hookRef: HookRef = { current: null };
    const props = {
      count: 100,
      estimateSize: 50,
      overscan: 5,
      measureSize: () => 100,
      hookRef,
    };
    const { container, rerender } = render(<Harness {...props} />);
    const scroller = container.firstElementChild as HTMLElement;

    act(() => hookRef.current?.scrollToIndex(99, { align: "start" }));
    act(() => {
      rerender(<Harness {...props} />);
    });
    act(() => {
      rerender(<Harness {...props} />);
    });

    // Item 99 (100px tall, 100 rows measured at 100px = totalSize 10000)
    // must be inside the [scrollTop, scrollTop+400) viewport, not stopped
    // short of it.
    const totalSize = hookRef.current?.totalSize ?? 0;
    const offsetOf99 = hookRef.current?.offsetOf(99) ?? 0;
    const sizeOf99 = hookRef.current?.sizeOf(99) ?? 0;
    expect(scroller.scrollTop + 400).toBeGreaterThanOrEqual(
      offsetOf99 + sizeOf99
    );
    expect(hookRef.current?.visibleEnd).toBe(100);
    expect(scroller.scrollTop).toBe(totalSize - 400);
  });

  it("align auto settles once on an item taller than the viewport", () => {
    const hookRef: HookRef = { current: null };
    const props = {
      count: 20,
      estimateSize: 50,
      overscan: 2,
      measureSize: (el: HTMLElement) =>
        el.getAttribute("data-index") === "3" ? 800 : 0,
      hookRef,
    };
    const { container } = render(<Harness {...props} />);
    const scroller = container.firstElementChild as HTMLElement;

    // Let the commit pass measure row 3 as 800px tall.
    expect(hookRef.current?.sizeOf(3)).toBe(800);
    expect(hookRef.current?.offsetOf(3)).toBe(150);

    act(() => hookRef.current?.scrollToIndex(3, { align: "auto" }));
    const firstStop = scroller.scrollTop;
    expect(firstStop).toBe(150);

    // A second identical call must be a no-op: the item already fills the
    // viewport, so "auto" should not oscillate.
    act(() => hookRef.current?.scrollToIndex(3, { align: "auto" }));
    expect(scroller.scrollTop).toBe(firstStop);
  });

  it("keyboard navigation leaves a focused input's own key handling alone", () => {
    const { container } = render(
      <VirtualRenderWave
        items={items(100)}
        itemHeight={40}
        containerHeight={400}
        batchSize={100}
        keyboardNavigation
        renderItem={(item) => <input defaultValue={item} />}
      />
    );
    const outer = container.firstElementChild as HTMLElement;
    scrollTo(outer, 400);
    expect(outer.scrollTop).toBe(400);

    const input = container.querySelector("input") as HTMLInputElement;
    expect(input).toBeTruthy();
    input.focus();

    const notPrevented = fireEvent.keyDown(input, { key: "Home" });
    expect(notPrevented).toBe(true);
    // The list must not have hijacked the key: scroll position is unchanged.
    expect(outer.scrollTop).toBe(400);

    // The container itself keeps working as before.
    const stillPrevented = fireEvent.keyDown(outer, { key: "Home" });
    expect(stillPrevented).toBe(false);
    expect(outer.scrollTop).toBe(0);
  });

  it("the injected fade-in keyframes are scoped to prefers-reduced-motion: no-preference", () => {
    render(
      <VirtualRenderWave
        items={items(20)}
        itemHeight={40}
        containerHeight={400}
        batchSize={20}
        transition
        renderItem={(item) => <div>{item}</div>}
      />
    );

    const style = document.head.querySelector("style[data-react-render-wave]");
    expect(style).toBeTruthy();
    expect(style?.textContent).toContain("prefers-reduced-motion");
    expect(style?.textContent).toContain("@keyframes rrw-fade-in");
  });

  it("a zero estimateSize does not disable virtualization", () => {
    const hookRef: HookRef = { current: null };
    const { container } = render(
      <Harness count={100000} estimateSize={0} overscan={5} hookRef={hookRef} />
    );

    const rendered = container.querySelectorAll('[role="listitem"]').length;
    // With a sane estimate the window renders a couple dozen rows at most.
    // A zero estimate must not make every row mount.
    expect(rendered).toBeLessThan(1000);
  });

  it("a negative overscan does not collapse the range to empty", () => {
    const hookRef: HookRef = { current: null };
    render(
      <Harness count={100} estimateSize={50} overscan={-10} hookRef={hookRef} />
    );

    expect(hookRef.current?.end).toBeGreaterThanOrEqual(
      hookRef.current?.start ?? 0
    );
    expect(hookRef.current?.virtualItems.length ?? 0).toBeGreaterThan(0);
  });

  it("scrollToIndex(NaN) leaves the current scroll position alone", () => {
    const hookRef: HookRef = { current: null };
    const { container } = render(
      <Harness count={1000} estimateSize={40} overscan={5} hookRef={hookRef} />
    );
    const scroller = container.firstElementChild as HTMLElement;

    act(() => hookRef.current?.scrollToIndex(30));
    expect(scroller.scrollTop).toBe(1200);

    act(() => hookRef.current?.scrollToIndex(Number.NaN));

    expect(scroller.scrollTop).toBe(1200);
  });

  // ---- D1/D2: a non-finite or negative initialScrollOffset must not seed a
  // non-finite or negative first-render scrollOffset. renderToString is used
  // rather than @testing-library/react's render, because the mount effect
  // that attaches the scroll listener also reads the DOM's own scrollTop
  // back into state; on the very next commit that overwrites the seeded
  // value with 0 regardless of whether the seed itself was clamped, hiding
  // the bug renderToString's effect-free first render still exposes (the
  // same first render server markup would emit, per C3 above).

  it("a NaN initialScrollOffset renders the same first window as no initial offset at all, and scrollOffset is 0 not NaN", () => {
    const withNaNRef: HookRef = { current: null };
    renderToString(
      <Harness
        count={1000}
        estimateSize={40}
        overscan={5}
        initialScrollOffset={Number.NaN}
        hookRef={withNaNRef}
      />
    );

    const withoutRef: HookRef = { current: null };
    renderToString(
      <Harness
        count={1000}
        estimateSize={40}
        overscan={5}
        hookRef={withoutRef}
      />
    );

    // scrollOffset must land on the finite fallback, not carry NaN through.
    expect(withNaNRef.current?.scrollOffset).toBe(0);
    expect(Number.isNaN(withNaNRef.current?.scrollOffset)).toBe(false);

    // The first window (rows from index 0) must match the no-offset case.
    expect(withNaNRef.current?.start).toBe(withoutRef.current?.start);
    expect(withNaNRef.current?.end).toBe(withoutRef.current?.end);
    expect(withNaNRef.current?.visibleStart).toBe(0);
    expect(withNaNRef.current?.visibleStart).toBe(
      withoutRef.current?.visibleStart
    );
  });

  it("a negative initialScrollOffset clamps scrollOffset to 0 on the first render", () => {
    const hookRef: HookRef = { current: null };
    renderToString(
      <Harness
        count={1000}
        estimateSize={40}
        overscan={5}
        initialScrollOffset={-500}
        hookRef={hookRef}
      />
    );

    expect(hookRef.current?.scrollOffset).toBe(0);
    expect(hookRef.current?.start).toBe(0);
    expect(hookRef.current?.visibleStart).toBe(0);
  });

  // ---- C2 (coverage): StrictMode remount must not orphan the ResizeObserver

  it("a StrictMode remount keeps every attached row under live observation", () => {
    const hookRef: HookRef = { current: null };
    render(
      <StrictMode>
        <Harness
          count={1000}
          estimateSize={40}
          overscan={5}
          hookRef={hookRef}
        />
      </StrictMode>
    );

    const observer = rowObserver();
    expect(observer).toBeDefined();

    // Every row element currently in the DOM must be observed by the live
    // instance, not just the one StrictMode's simulated first mount created
    // and then disconnected.
    const rowEls = Array.from(document.querySelectorAll('[role="listitem"]'));
    expect(rowEls.length).toBeGreaterThan(0);
    for (const el of rowEls) {
      expect(observer?.observed.has(el)).toBe(true);
    }

    // And the observer actually delivers: triggering a size change on a row
    // measures it, with no rerender in between to hide a broken hookup.
    stubHeight(rowEls[0] as HTMLElement, 123);
    act(() => {
      observer?.trigger([rowEls[0] as HTMLElement]);
    });
    expect(hookRef.current?.sizeOf(0)).toBe(123);
  });
});
