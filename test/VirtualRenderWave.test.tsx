import { act, fireEvent, render, screen } from "@testing-library/react";
import { createRef } from "react";
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
import type { VirtualRenderWaveHandle } from "../src/types";
import { MockResizeObserver } from "./setup";

// jsdom performs no layout. Heights are derived from inline styles so the
// component sees a realistic viewport and content size.
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

const findItemsObserver = () =>
  MockResizeObserver.instances.find((ro) =>
    Array.from(ro.observed).some(
      (el) => el.getAttribute("role") === "listitem"
    )
  );

describe("VirtualRenderWave", () => {
  it("renders only the visible window plus overscan", () => {
    const { container } = render(
      <VirtualRenderWave
        items={items(1000)}
        itemHeight={40}
        containerHeight={400}
        overscan={5}
        batchSize={1000}
        renderItem={(item) => <div>{item}</div>}
      />
    );

    // 10 rows fit in 400px, plus 5 overscan below.
    expect(screen.getAllByRole("listitem")).toHaveLength(15);
    expect(screen.getByText("Item 0")).toBeTruthy();
    expect(screen.queryByText("Item 15")).toBeNull();

    const inner = container.querySelector('[role="list"]') as HTMLElement;
    expect(inner.style.height).toBe("40000px");
  });

  it("moves the window when scrolled", () => {
    const { container } = render(
      <VirtualRenderWave
        items={items(1000)}
        itemHeight={40}
        containerHeight={400}
        overscan={5}
        batchSize={1000}
        renderItem={(item) => <div>{item}</div>}
      />
    );
    const outer = container.firstElementChild as HTMLElement;

    scrollTo(outer, 4000);

    expect(screen.queryByText("Item 0")).toBeNull();
    expect(screen.getByText("Item 95")).toBeTruthy();
    expect(screen.getByText("Item 100")).toBeTruthy();
    expect(screen.getByText("Item 114")).toBeTruthy();
    expect(screen.queryByText("Item 115")).toBeNull();
  });

  it("sizes the viewport from a style height instead of containerHeight", () => {
    render(
      <VirtualRenderWave
        items={items(1000)}
        itemHeight={40}
        style={{ height: 200 }}
        overscan={5}
        batchSize={1000}
        renderItem={(item) => <div>{item}</div>}
      />
    );
    // 5 rows fit in 200px, plus 5 overscan below.
    expect(screen.getAllByRole("listitem")).toHaveLength(10);
  });

  it("shows skeletons for items the wave has not reached", () => {
    render(
      <VirtualRenderWave
        items={items(100)}
        itemHeight={40}
        containerHeight={400}
        overscan={5}
        batchSize={5}
        interval={50}
        renderItem={(item) => <div>{item}</div>}
        renderSkeleton={(i) => <div>Skeleton {i}</div>}
      />
    );

    expect(screen.getByText("Item 4")).toBeTruthy();
    expect(screen.queryByText("Item 5")).toBeNull();
    expect(screen.getByText("Skeleton 5")).toBeTruthy();

    act(() => {
      vi.advanceTimersByTime(100);
    });

    expect(screen.getByText("Item 9")).toBeTruthy();
    expect(screen.getByText("Skeleton 10")).toBeTruthy();
  });

  it("renders an empty list without crashing", () => {
    render(
      <VirtualRenderWave
        items={[]}
        itemHeight={40}
        renderItem={(item) => <div>{String(item)}</div>}
      />
    );
    expect(screen.queryAllByRole("listitem")).toHaveLength(0);
  });

  it("fires onEndReached once per arrival at the end", () => {
    const onEndReached = vi.fn();
    const { container } = render(
      <VirtualRenderWave
        items={items(100)}
        itemHeight={40}
        containerHeight={400}
        batchSize={100}
        onEndReached={onEndReached}
        renderItem={(item) => <div>{item}</div>}
      />
    );
    const outer = container.firstElementChild as HTMLElement;

    scrollTo(outer, 3600);
    expect(onEndReached).toHaveBeenCalledTimes(1);

    // Still at the end: no repeat fire.
    scrollTo(outer, 3595);
    expect(onEndReached).toHaveBeenCalledTimes(1);

    // Leave and come back: fires again.
    scrollTo(outer, 1000);
    scrollTo(outer, 3600);
    expect(onEndReached).toHaveBeenCalledTimes(2);
  });

  it("reports scroll positions through onScroll", () => {
    const onScroll = vi.fn();
    const { container } = render(
      <VirtualRenderWave
        items={items(100)}
        itemHeight={40}
        containerHeight={400}
        batchSize={100}
        onScroll={onScroll}
        renderItem={(item) => <div>{item}</div>}
      />
    );
    const outer = container.firstElementChild as HTMLElement;
    scrollTo(outer, 1234);
    expect(onScroll).toHaveBeenLastCalledWith(1234);
  });

  describe("keyboard navigation", () => {
    const setup = (keyboardNavigation = true) => {
      const { container } = render(
        <VirtualRenderWave
          items={items(100)}
          itemHeight={40}
          containerHeight={400}
          batchSize={100}
          keyboardNavigation={keyboardNavigation}
          renderItem={(item) => <div>{item}</div>}
        />
      );
      return container.firstElementChild as HTMLElement;
    };

    it("scrolls by one item with the arrow keys and prevents default", () => {
      const outer = setup();
      const notPrevented = fireEvent.keyDown(outer, { key: "ArrowDown" });
      expect(notPrevented).toBe(false);
      expect(outer.scrollTop).toBe(40);

      fireEvent.keyDown(outer, { key: "ArrowUp" });
      expect(outer.scrollTop).toBe(0);
    });

    it("scrolls by one page and jumps with Home and End", () => {
      const outer = setup();
      fireEvent.keyDown(outer, { key: "PageDown" });
      expect(outer.scrollTop).toBe(400);
      fireEvent.keyDown(outer, { key: "End" });
      expect(outer.scrollTop).toBe(3600);
      fireEvent.keyDown(outer, { key: "PageUp" });
      expect(outer.scrollTop).toBe(3200);
      fireEvent.keyDown(outer, { key: "Home" });
      expect(outer.scrollTop).toBe(0);
    });

    it("ignores unrelated keys", () => {
      const outer = setup();
      const notPrevented = fireEvent.keyDown(outer, { key: "a" });
      expect(notPrevented).toBe(true);
      expect(outer.scrollTop).toBe(0);
    });

    it("is inert when keyboardNavigation is off", () => {
      const outer = setup(false);
      fireEvent.keyDown(outer, { key: "ArrowDown" });
      expect(outer.scrollTop).toBe(0);
      expect(outer.getAttribute("tabindex")).toBeNull();
    });

    it("makes the container focusable when on", () => {
      const outer = setup();
      expect(outer.getAttribute("tabindex")).toBe("0");
    });
  });

  it("exposes a working imperative handle", () => {
    const ref = createRef<VirtualRenderWaveHandle>();
    const { container } = render(
      <VirtualRenderWave
        ref={ref}
        items={items(100)}
        itemHeight={40}
        containerHeight={400}
        overscan={5}
        batchSize={100}
        renderItem={(item) => <div>{item}</div>}
      />
    );
    const outer = container.firstElementChild as HTMLElement;

    expect(ref.current?.getScrollElement()).toBe(outer);
    expect(ref.current?.getVisibleIndexes()).toEqual(
      Array.from({ length: 15 }, (_, i) => i)
    );

    act(() => {
      ref.current?.scrollTo(10);
    });
    expect(outer.scrollTop).toBe(400);

    act(() => {
      ref.current?.scrollToOffset(123);
    });
    expect(outer.scrollTop).toBe(123);
  });

  it("scrolls when scrollToIndex changes and only then", () => {
    const makeProps = (scrollToIndex: number) => ({
      items: items(100),
      itemHeight: 40,
      containerHeight: 400,
      batchSize: 100,
      scrollToIndex,
      renderItem: (item: string) => <div>{item}</div>,
    });
    const { container, rerender } = render(
      <VirtualRenderWave {...makeProps(50)} />
    );
    const outer = container.firstElementChild as HTMLElement;
    expect(outer.scrollTop).toBe(2000);

    rerender(<VirtualRenderWave {...makeProps(10)} />);
    expect(outer.scrollTop).toBe(400);

    // The user scrolls away; an unchanged scrollToIndex must not snap back.
    scrollTo(outer, 0);
    rerender(<VirtualRenderWave {...makeProps(10)} />);
    expect(outer.scrollTop).toBe(0);
  });

  it("snaps to the nearest batch after scrolling stops", () => {
    const { container } = render(
      <VirtualRenderWave
        items={items(200)}
        itemHeight={40}
        containerHeight={400}
        batchSize={10}
        snapToBatch
        renderItem={(item) => <div>{item}</div>}
      />
    );
    const outer = container.firstElementChild as HTMLElement;

    scrollTo(outer, 550);
    act(() => {
      // Debounce delay plus the follow-up frame.
      vi.advanceTimersByTime(400);
    });
    expect(outer.scrollTop).toBe(400);
  });

  it("shows a sticky header for the topmost visible group", () => {
    type Row = { label: string; group: string };
    const rows: Row[] = Array.from({ length: 60 }, (_, i) => ({
      label: `Row ${i}`,
      group: i < 30 ? "A" : "B",
    }));
    const { container } = render(
      <VirtualRenderWave
        items={rows}
        itemHeight={40}
        containerHeight={400}
        batchSize={60}
        groupByKey="group"
        renderStickyHeader={(group) => <div>Group {group}</div>}
        renderItem={(row) => <div>{row.label}</div>}
      />
    );
    const outer = container.firstElementChild as HTMLElement;

    expect(screen.getByText("Group A")).toBeTruthy();

    scrollTo(outer, 31 * 40);
    expect(screen.getByText("Group B")).toBeTruthy();
    expect(screen.queryByText("Group A")).toBeNull();
  });

  it("re-positions following items when one is measured taller", () => {
    const { container } = render(
      <VirtualRenderWave
        items={items(100)}
        itemHeight={40}
        containerHeight={400}
        batchSize={100}
        renderItem={(item) => <div>{item}</div>}
      />
    );

    const first = container.querySelector('[aria-posinset="1"]') as HTMLElement;
    const second = container.querySelector(
      '[aria-posinset="2"]'
    ) as HTMLElement;
    expect(second.style.top).toBe("40px");

    Object.defineProperty(first, "offsetHeight", {
      configurable: true,
      value: 100,
    });
    const observer = findItemsObserver();
    expect(observer).toBeDefined();
    act(() => {
      observer?.trigger([first]);
    });

    expect(second.style.top).toBe("100px");
    const inner = container.querySelector('[role="list"]') as HTMLElement;
    expect(inner.style.height).toBe(`${40 * 99 + 100}px`);
  });

  it("measures on commit even when ResizeObserver never fires", () => {
    // Rows report their height through offsetHeight, but nothing ever
    // delivers a ResizeObserver entry. This is the path that keeps offsets
    // correct in environments where the observer is missing or throttled.
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
      const { container } = render(
        <VirtualRenderWave
          items={items(100)}
          itemHeight={40}
          containerHeight={400}
          batchSize={100}
          renderItem={(item) => <div>{item}</div>}
        />
      );

      const second = container.querySelector(
        '[aria-posinset="2"]'
      ) as HTMLElement;
      expect(second.style.top).toBe("90px");

      // The first window is sized with the 40px estimate and mounts 15 rows.
      // Measuring them at 90px shrinks the window to 10, but the 15
      // measurements are kept, so the total settles at a mix of measured and
      // estimated rows rather than collapsing back.
      const inner = container.querySelector('[role="list"]') as HTMLElement;
      expect(container.querySelectorAll('[role="listitem"]')).toHaveLength(10);
      expect(inner.style.height).toBe(`${15 * 90 + 85 * 40}px`);
    } finally {
      if (offsetHeight) {
        Object.defineProperty(HTMLElement.prototype, "offsetHeight", offsetHeight);
      } else {
        Reflect.deleteProperty(HTMLElement.prototype, "offsetHeight");
      }
    }
  });

  it("labels items for assistive tech", () => {
    const { container } = render(
      <VirtualRenderWave
        items={items(50)}
        itemHeight={40}
        containerHeight={400}
        batchSize={50}
        ariaLabel="Demo list"
        renderItem={(item) => <div>{item}</div>}
      />
    );
    const outer = container.firstElementChild as HTMLElement;
    expect(outer.getAttribute("aria-label")).toBe("Demo list");
    const firstItem = container.querySelector('[role="listitem"]');
    expect(firstItem?.getAttribute("aria-setsize")).toBe("50");
    expect(firstItem?.getAttribute("aria-posinset")).toBe("1");
  });
});
