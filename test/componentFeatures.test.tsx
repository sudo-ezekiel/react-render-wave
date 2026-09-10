import { act, render, screen } from "@testing-library/react";
import { createRef, type Ref } from "react";
import { hydrateRoot } from "react-dom/client";
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
import type {
  VirtualRenderWaveHandle,
  VirtualRenderWaveProps,
} from "../src/types";
import { MockResizeObserver } from "./setup";

// jsdom performs no layout. Heights are derived from inline styles so the
// component sees a realistic viewport and content size. Copied from
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

const items = (n: number) => Array.from({ length: n }, (_, i) => `Item ${i}`);

const keyedRows = (n: number) =>
  Array.from({ length: n }, (_, i) => ({ id: i, label: `Item ${i}` }));

const scrollTo = (el: HTMLElement, top: number) => {
  act(() => {
    el.scrollTop = top;
    el.dispatchEvent(new Event("scroll"));
    // Flush the animation frame that commits the new scroll position.
    vi.advanceTimersByTime(20);
  });
};

/** Interval 50 plus the frame the wave is committed on. */
const wave = () => {
  act(() => {
    vi.advanceTimersByTime(100);
  });
};

const shown = (index: number) => screen.queryByText(`Item ${index}`) !== null;
const skeleton = (index: number) =>
  screen.queryByText(`Skeleton ${index}`) !== null;

const rowObserverOf = (el: Element) =>
  MockResizeObserver.instances.find((ro) => ro.observed.has(el));

const stubHeight = (el: Element, value: number) => {
  Object.defineProperty(el, "offsetHeight", { configurable: true, value });
};

type ListProps = Partial<VirtualRenderWaveProps<string>> & {
  ref?: Ref<VirtualRenderWaveHandle>;
};

const list = (props: ListProps = {}) => (
  <VirtualRenderWave
    items={items(1000)}
    itemHeight={40}
    containerHeight={400}
    overscan={5}
    batchSize={5}
    interval={50}
    renderItem={(item) => <div>{item}</div>}
    renderSkeleton={(i) => <div>Skeleton {i}</div>}
    {...props}
  />
);

describe("VirtualRenderWave, viewport reveal edge cases", () => {
  it("keeps a row's revealed key revealed after a reorder, without re-staggering", () => {
    const rows = keyedRows(20);
    const { rerender } = render(
      <VirtualRenderWave
        items={rows}
        itemHeight={40}
        containerHeight={400}
        overscan={20}
        batchSize={5}
        interval={50}
        revealMode="viewport"
        getItemKey={(item) => item.id}
        renderItem={(item) => <div>{item.label}</div>}
        renderSkeleton={(i) => <div>Skeleton {i}</div>}
      />
    );

    // First batch of the window, ids 0..4.
    for (let i = 0; i < 5; i++) expect(shown(i)).toBe(true);
    for (let i = 5; i < 20; i++) expect(skeleton(i)).toBe(true);

    rerender(
      <VirtualRenderWave
        items={[...rows].reverse()}
        itemHeight={40}
        containerHeight={400}
        overscan={20}
        batchSize={5}
        interval={50}
        revealMode="viewport"
        getItemKey={(item) => item.id}
        renderItem={(item) => <div>{item.label}</div>}
        renderSkeleton={(i) => <div>Skeleton {i}</div>}
      />
    );

    // Ids 0..4 are still revealed, now sitting at indexes 19..15. No
    // re-stagger happens: this holds without advancing a single wave.
    for (let id = 0; id <= 4; id++) expect(shown(id)).toBe(true);
    for (let index = 0; index <= 14; index++)
      expect(skeleton(index)).toBe(true);
    for (let index = 15; index <= 19; index++) {
      expect(shown(19 - index)).toBe(true);
    }
  });

  it("never reveals rows before startIndex, and reveals from startIndex in batches", () => {
    const { container } = render(
      list({
        items: items(30),
        revealMode: "viewport",
        startIndex: 5,
        overscan: 5,
      })
    );
    const outer = container.firstElementChild as HTMLElement;
    void outer;

    for (let i = 0; i < 5; i++) expect(skeleton(i)).toBe(true);
    expect(shown(5)).toBe(true);
    expect(shown(9)).toBe(true);
    expect(shown(10)).toBe(false);

    wave();
    wave();
    wave();
    wave();

    // The rows before startIndex never reveal, no matter how many waves run.
    for (let i = 0; i < 5; i++) expect(skeleton(i)).toBe(true);
    // The window [5, 15) has fully revealed by now.
    for (let i = 5; i < 15; i++) expect(shown(i)).toBe(true);
  });

  it("shows exactly batchSize revealed items and the rest skeletons on the very first client render", () => {
    const { container } = render(
      <VirtualRenderWave
        items={items(50)}
        itemHeight={40}
        containerHeight={400}
        overscan={5}
        batchSize={5}
        interval={50}
        revealMode="viewport"
        renderItem={(item) => <div data-kind="item">{item}</div>}
        renderSkeleton={(i) => <div data-kind="skeleton">Skeleton {i}</div>}
      />
    );

    const revealedCount = (container.innerHTML.match(/data-kind="item"/g) ?? [])
      .length;
    const skeletonCount = (
      container.innerHTML.match(/data-kind="skeleton"/g) ?? []
    ).length;

    expect(revealedCount).toBe(5);
    expect(skeletonCount).toBe(10);
  });

  it("marks only revealed rows with the fade transition in viewport mode", () => {
    const { container } = render(
      list({
        items: items(30),
        revealMode: "viewport",
        overscan: 5,
        batchSize: 5,
        transition: true,
      })
    );

    const rows = Array.from(container.querySelectorAll('[role="listitem"]'));
    expect(rows.length).toBeGreaterThan(0);

    const revealedRows = rows.filter((row) =>
      row.textContent?.startsWith("Item")
    );
    const skeletonRows = rows.filter((row) =>
      row.textContent?.startsWith("Skeleton")
    );
    expect(revealedRows.length).toBeGreaterThan(0);
    expect(skeletonRows.length).toBeGreaterThan(0);

    for (const row of revealedRows) {
      expect((row as HTMLElement).style.animation).toContain("rrw-fade-in");
    }
    for (const row of skeletonRows) {
      expect((row as HTMLElement).style.animation).toBe("");
    }
  });

  it("lists no revealed indexes right after a jump to a part of the list nobody has seen, then the first batch after a wave", () => {
    const ref = createRef<VirtualRenderWaveHandle>();
    const { container } = render(
      list({
        items: items(1000),
        ref,
        revealMode: "viewport",
        overscan: 5,
        batchSize: 5,
      })
    );
    const outer = container.firstElementChild as HTMLElement;

    scrollTo(outer, 4000);
    expect(ref.current?.getVisibleIndexes()).toEqual([]);

    wave();
    expect(ref.current?.getVisibleIndexes()).toEqual([95, 96, 97, 98, 99]);
  });
});

describe("VirtualRenderWave, onRangeChange", () => {
  it("fires on mount, on scroll, and when a shrinking list changes the range, with half-open bounds matching the rendered rows", () => {
    const onRangeChange = vi.fn();
    const { container, rerender } = render(
      list({ items: items(1000), onRangeChange, batchSize: 1000 })
    );
    const outer = container.firstElementChild as HTMLElement;

    expect(onRangeChange).toHaveBeenCalledTimes(1);
    let last = onRangeChange.mock.calls[onRangeChange.mock.calls.length - 1][0];
    expect(last).toEqual({
      start: 0,
      end: 15,
      visibleStart: 0,
      visibleEnd: 10,
    });
    let posinsets = Array.from(
      container.querySelectorAll('[role="listitem"]')
    ).map((el) => Number(el.getAttribute("aria-posinset")));
    expect(Math.min(...posinsets)).toBe(last.start + 1);
    expect(Math.max(...posinsets)).toBe(last.end);

    scrollTo(outer, 4000);
    expect(onRangeChange).toHaveBeenCalledTimes(2);
    last = onRangeChange.mock.calls[onRangeChange.mock.calls.length - 1][0];
    expect(last).toEqual({
      start: 95,
      end: 115,
      visibleStart: 100,
      visibleEnd: 110,
    });
    posinsets = Array.from(container.querySelectorAll('[role="listitem"]')).map(
      (el) => Number(el.getAttribute("aria-posinset"))
    );
    expect(Math.min(...posinsets)).toBe(last.start + 1);
    expect(Math.max(...posinsets)).toBe(last.end);

    const callsBeforeShrink = onRangeChange.mock.calls.length;
    rerender(list({ items: items(50), onRangeChange, batchSize: 1000 }));
    expect(onRangeChange.mock.calls.length).toBeGreaterThan(callsBeforeShrink);
    last = onRangeChange.mock.calls[onRangeChange.mock.calls.length - 1][0];
    expect(last.end).toBeLessThanOrEqual(50);
    expect(last.end).toBeGreaterThan(last.start);
  });
});

describe("VirtualRenderWave, dynamic heights and scroll targeting", () => {
  it("corrects a scrollTop opened at initialScrollIndex once an earlier row measures taller", () => {
    const { container, rerender } = render(
      list({
        items: items(1000),
        initialScrollIndex: 50,
        overscan: 40,
        batchSize: 1000,
      })
    );
    const outer = container.firstElementChild as HTMLElement;
    expect(outer.scrollTop).toBe(2000);

    const row10 = container.querySelector(
      '[aria-posinset="11"]'
    ) as HTMLElement;
    expect(row10).toBeTruthy();
    stubHeight(row10, 100);
    const observer = rowObserverOf(row10);
    act(() => {
      observer?.trigger([row10]);
    });

    // The row observer's report alone does not commit; force the pass that
    // reads it by re-rendering, exactly as the underlying hook's own test
    // does for the same correction.
    act(() => {
      rerender(
        list({
          items: items(1000),
          initialScrollIndex: 50,
          overscan: 40,
          batchSize: 1000,
        })
      );
    });

    expect(outer.scrollTop).toBe(2060);
  });

  it("handles a center align, a no-op auto align on a visible row, and an offset scroll that survives a smooth scroll's settle window", () => {
    const ref = createRef<VirtualRenderWaveHandle>();
    const { container } = render(
      list({ items: items(1000), ref, batchSize: 1000 })
    );
    const outer = container.firstElementChild as HTMLElement;

    act(() => {
      ref.current?.scrollTo(50, { align: "center", behavior: "auto" });
    });
    expect(outer.scrollTop).toBe(1820);

    // Item 50 (offset 2000, size 40) is already fully inside the viewport
    // [1820, 2220), so an "auto" align has nothing to do.
    act(() => {
      ref.current?.scrollTo(50, { align: "auto" });
    });
    expect(outer.scrollTop).toBe(1820);

    act(() => {
      ref.current?.scrollTo(10);
    });
    expect(outer.scrollTop).toBe(400);

    act(() => {
      ref.current?.scrollToOffset(123);
    });
    expect(outer.scrollTop).toBe(123);

    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(outer.scrollTop).toBe(123);
  });

  it("opens at initialScrollIndex over an initial scrollToIndex, then honors later changes to scrollToIndex", () => {
    const { container, rerender } = render(
      list({
        items: items(1000),
        initialScrollIndex: 50,
        scrollToIndex: 10,
        batchSize: 1000,
      })
    );
    const outer = container.firstElementChild as HTMLElement;
    expect(outer.scrollTop).toBe(2000);

    act(() => {
      rerender(
        list({
          items: items(1000),
          initialScrollIndex: 50,
          scrollToIndex: 80,
          batchSize: 1000,
        })
      );
    });
    expect(outer.scrollTop).toBe(3200);
  });

  it("carries a measured size to its item's new position after a keyed reorder", () => {
    const rows = keyedRows(5);
    const { rerender } = render(
      <VirtualRenderWave
        items={rows}
        itemHeight={40}
        containerHeight={400}
        batchSize={5}
        getItemKey={(item) => item.id}
        renderItem={(item) => <div>{item.label}</div>}
      />
    );

    const rowA = screen
      .getByText("Item 0")
      .closest('[role="listitem"]') as HTMLElement;
    stubHeight(rowA, 100);
    const observer = rowObserverOf(rowA);
    act(() => {
      observer?.trigger([rowA]);
    });

    // Reorder: b, c, a, d, e. a's 100px size now belongs at its new index 2,
    // so the row after it (d, at index 3) sits at 40 + 40 + 100 = 180px.
    const reordered = [rows[1], rows[2], rows[0], rows[3], rows[4]];
    rerender(
      <VirtualRenderWave
        items={reordered}
        itemHeight={40}
        containerHeight={400}
        batchSize={5}
        getItemKey={(item) => item.id}
        renderItem={(item) => <div>{item.label}</div>}
      />
    );

    const rowD = screen
      .getByText("Item 3")
      .closest('[role="listitem"]') as HTMLElement;
    expect(rowD.style.top).toBe("180px");
  });

  it("keeps a measured size across a rerender that changes only the identity of an inline getItemKey", () => {
    const rows = keyedRows(5);
    const { rerender } = render(
      <VirtualRenderWave
        items={rows}
        itemHeight={40}
        containerHeight={400}
        batchSize={5}
        getItemKey={(item) => item.id}
        renderItem={(item) => <div>{item.label}</div>}
      />
    );

    const row0 = screen
      .getByText("Item 0")
      .closest('[role="listitem"]') as HTMLElement;
    stubHeight(row0, 100);
    const observer = rowObserverOf(row0);
    act(() => {
      observer?.trigger([row0]);
    });

    const row1Before = screen
      .getByText("Item 1")
      .closest('[role="listitem"]') as HTMLElement;
    expect(row1Before.style.top).toBe("100px");

    // Same items array, but a brand new inline arrow for getItemKey.
    rerender(
      <VirtualRenderWave
        items={rows}
        itemHeight={40}
        containerHeight={400}
        batchSize={5}
        getItemKey={(item) => item.id}
        renderItem={(item) => <div>{item.label}</div>}
      />
    );

    const row1After = screen
      .getByText("Item 1")
      .closest('[role="listitem"]') as HTMLElement;
    expect(row1After.style.top).toBe("100px");
  });
});

describe("VirtualRenderWave, viewport reveal hydration", () => {
  it("hydrates in viewport mode without logging a hydration mismatch", () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const element = (
        <VirtualRenderWave
          items={items(1000)}
          itemHeight={40}
          containerHeight={400}
          batchSize={5}
          interval={50}
          overscan={5}
          revealMode="viewport"
          getItemKey={(_item, index) => index}
          renderItem={(item) => <div>{item}</div>}
          renderSkeleton={(i) => <div>Skeleton {i}</div>}
        />
      );
      const markup = renderToString(element);
      const container = document.createElement("div");
      container.innerHTML = markup;
      document.body.appendChild(container);

      let root: ReturnType<typeof hydrateRoot> | undefined;
      act(() => {
        root = hydrateRoot(container, element);
      });

      const hydrationErrors = errorSpy.mock.calls.filter((call) => {
        const message = String(call[0]);
        return (
          message.includes("Hydration failed") ||
          message.includes("did not match")
        );
      });
      expect(hydrationErrors).toEqual([]);

      act(() => {
        root?.unmount();
      });
      container.remove();
    } finally {
      errorSpy.mockRestore();
    }
  });
});
