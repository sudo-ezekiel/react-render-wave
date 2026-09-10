import { act, render, screen, within } from "@testing-library/react";
import { createRef } from "react";
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
import type { VirtualRenderWaveHandle } from "../src/types";
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

const scrollTo = (el: HTMLElement, top: number) => {
  act(() => {
    el.scrollTop = top;
    el.dispatchEvent(new Event("scroll"));
    // Flush the animation frame that commits the new scroll position.
    vi.advanceTimersByTime(20);
  });
};

describe("VirtualRenderWave behaviours (regression net for the windowing refactor)", () => {
  it("injects a single shared keyframes style and marks only revealed rows with the fade animation", () => {
    const list = items(5);
    const { container: c1 } = render(
      <VirtualRenderWave
        items={list}
        itemHeight={40}
        containerHeight={400}
        batchSize={5}
        transition
        renderItem={(item) => <div>{item}</div>}
      />
    );
    const { container: c2 } = render(
      <VirtualRenderWave
        items={list}
        itemHeight={40}
        containerHeight={400}
        batchSize={5}
        transition
        renderItem={(item) => <div>{item}</div>}
      />
    );

    expect(
      document.head.querySelectorAll("style[data-react-render-wave]")
    ).toHaveLength(1);

    const revealedRows = [
      ...c1.querySelectorAll('[role="listitem"]'),
      ...c2.querySelectorAll('[role="listitem"]'),
    ];
    expect(revealedRows.length).toBeGreaterThan(0);
    for (const row of revealedRows) {
      expect((row as HTMLElement).style.animation).toContain("rrw-fade-in");
    }

    const { container: c3 } = render(
      <VirtualRenderWave
        items={items(20)}
        itemHeight={40}
        containerHeight={400}
        batchSize={2}
        transition
        renderSkeleton={(i) => <div>Skeleton {i}</div>}
        renderItem={(item) => <div>{item}</div>}
      />
    );
    const skeletonRows = Array.from(
      c3.querySelectorAll('[role="listitem"]')
    ).filter((row) => row.textContent?.startsWith("Skeleton"));
    expect(skeletonRows.length).toBeGreaterThan(0);
    for (const row of skeletonRows) {
      expect((row as HTMLElement).style.animation).toBe("");
    }
  });

  it("keeps the same DOM node for a row across a reorder when getItemKey is stable", () => {
    type Row = { id: number; label: string };
    const rows: Row[] = Array.from({ length: 12 }, (_, i) => ({
      id: i,
      label: `Item ${i}`,
    }));

    const { rerender } = render(
      <VirtualRenderWave
        items={rows}
        itemHeight={40}
        containerHeight={400}
        batchSize={12}
        getItemKey={(item) => item.id}
        renderItem={(item) => <div>{item.label}</div>}
      />
    );
    const original = screen.getByText("Item 3").closest('[role="listitem"]');
    expect(original).toBeTruthy();

    rerender(
      <VirtualRenderWave
        items={[...rows].reverse()}
        itemHeight={40}
        containerHeight={400}
        batchSize={12}
        getItemKey={(item) => item.id}
        renderItem={(item) => <div>{item.label}</div>}
      />
    );
    const afterReorder = screen
      .getByText("Item 3")
      .closest('[role="listitem"]');
    expect(afterReorder).toBe(original);
    expect((afterReorder as HTMLElement).style.top).toBe("320px");
  });

  it("renders skeletons before startIndex and starts the visible window at startIndex", () => {
    const ref = createRef<VirtualRenderWaveHandle>();
    render(
      <VirtualRenderWave
        ref={ref}
        items={items(50)}
        itemHeight={40}
        containerHeight={400}
        startIndex={5}
        batchSize={100}
        renderSkeleton={(i) => <div>Skeleton {i}</div>}
        renderItem={(item) => <div>{item}</div>}
      />
    );

    for (let i = 0; i < 5; i++) {
      expect(screen.getByText(`Skeleton ${i}`)).toBeTruthy();
    }
    expect(screen.getByText("Item 5")).toBeTruthy();
    expect(screen.queryByText("Skeleton 5")).toBeNull();

    const visible = ref.current?.getVisibleIndexes();
    expect(visible?.[0]).toBe(5);
  });

  it("recomputes offsets and total height when itemHeight changes", () => {
    const { container, rerender } = render(
      <VirtualRenderWave
        items={items(1000)}
        itemHeight={40}
        containerHeight={400}
        batchSize={1000}
        renderItem={(item) => <div>{item}</div>}
      />
    );
    const inner = () => container.querySelector('[role="list"]') as HTMLElement;
    const second = () =>
      container.querySelector('[aria-posinset="2"]') as HTMLElement;
    expect(inner().style.height).toBe("40000px");
    expect(second().style.top).toBe("40px");

    rerender(
      <VirtualRenderWave
        items={items(1000)}
        itemHeight={80}
        containerHeight={400}
        batchSize={1000}
        renderItem={(item) => <div>{item}</div>}
      />
    );
    expect(inner().style.height).toBe("80000px");
    expect(second().style.top).toBe("80px");
  });

  it("grows the rendered window when the viewport is resized", () => {
    const { container } = render(
      <VirtualRenderWave
        items={items(1000)}
        itemHeight={40}
        containerHeight={400}
        batchSize={1000}
        renderItem={(item) => <div>{item}</div>}
      />
    );
    const outer = container.firstElementChild as HTMLElement;
    expect(screen.getAllByRole("listitem")).toHaveLength(15);

    const viewportObserver = MockResizeObserver.instances.find((ro) =>
      ro.observed.has(outer)
    );
    expect(viewportObserver).toBeDefined();

    act(() => {
      outer.style.height = "800px";
      viewportObserver?.trigger([outer]);
    });

    // 20 rows fit in 800px, plus 5 overscan below.
    expect(screen.getAllByRole("listitem")).toHaveLength(25);
  });

  it("passes className and style through to the outer element, sizing the viewport from style.height", () => {
    render(
      <VirtualRenderWave
        items={items(1000)}
        itemHeight={40}
        style={{ height: 200 }}
        batchSize={1000}
        renderItem={(item) => <div>{item}</div>}
      />
    );
    const count200 = screen.getAllByRole("listitem").length;
    expect(count200).toBe(10);

    const { container } = render(
      <VirtualRenderWave
        items={items(1000)}
        itemHeight={40}
        className="my-list"
        style={{ background: "red", height: 300 }}
        batchSize={1000}
        renderItem={(item) => <div>{item}</div>}
      />
    );
    const outer = container.firstElementChild as HTMLElement;
    expect(outer.className).toBe("my-list");
    expect(outer.style.background).toBe("red");
    expect(outer.style.overflowY).toBe("auto");
    expect(outer.style.position).toBe("relative");

    const count300 = within(container).getAllByRole("listitem").length;
    expect(count300).toBeGreaterThan(count200);
  });

  it("renders exactly the fitting rows when overscan is 0", () => {
    render(
      <VirtualRenderWave
        items={items(1000)}
        itemHeight={40}
        containerHeight={400}
        overscan={0}
        batchSize={1000}
        renderItem={(item) => <div>{item}</div>}
      />
    );
    expect(screen.getAllByRole("listitem")).toHaveLength(10);
  });

  it("clamps scrollToIndex past the end to the bottom of the list", () => {
    const { container } = render(
      <VirtualRenderWave
        items={items(100)}
        itemHeight={40}
        containerHeight={400}
        batchSize={100}
        scrollToIndex={5000}
        renderItem={(item) => <div>{item}</div>}
      />
    );
    const outer = container.firstElementChild as HTMLElement;
    // 4000px of content in a 400px viewport: the last scroll position is
    // 3600. The windowing hook clamps to it up front, where the pre-hook
    // component wrote the raw 4000 offset and left the clamping to the
    // browser (jsdom does not clamp, so the old expectation was 4000).
    expect(outer.scrollTop).toBe(3600);
  });

  it("supports groupByKey as a function alongside a sticky header", () => {
    const rows = Array.from({ length: 60 }, (_, i) => ({ label: `Row ${i}` }));
    const { container } = render(
      <VirtualRenderWave
        items={rows}
        itemHeight={40}
        containerHeight={400}
        batchSize={60}
        groupByKey={(_item, index) => (index < 30 ? "A" : "B")}
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

  it("renders no sticky header unless both groupByKey and renderStickyHeader are provided", () => {
    const rows = Array.from({ length: 10 }, (_, i) => ({
      label: `Row ${i}`,
      group: "A",
    }));

    const { container: c1 } = render(
      <VirtualRenderWave
        items={rows}
        itemHeight={40}
        containerHeight={400}
        batchSize={10}
        renderStickyHeader={(group) => <div>Group {group}</div>}
        renderItem={(row) => <div>{row.label}</div>}
      />
    );
    expect(within(c1).queryByText(/^Group /)).toBeNull();

    const { container: c2 } = render(
      <VirtualRenderWave
        items={rows}
        itemHeight={40}
        containerHeight={400}
        batchSize={10}
        groupByKey="group"
        renderItem={(row) => <div>{row.label}</div>}
      />
    );
    expect(within(c2).queryByText(/^Group /)).toBeNull();
  });

  it("handles items shrinking below the current scroll position without crashing", () => {
    const { container, rerender } = render(
      <VirtualRenderWave
        items={items(1000)}
        itemHeight={40}
        containerHeight={400}
        batchSize={1000}
        renderItem={(item) => <div>{item}</div>}
      />
    );
    const outer = container.firstElementChild as HTMLElement;
    scrollTo(outer, 4000);

    expect(() =>
      rerender(
        <VirtualRenderWave
          items={items(50)}
          itemHeight={40}
          containerHeight={400}
          batchSize={1000}
          renderItem={(item) => <div>{item}</div>}
        />
      )
    ).not.toThrow();

    expect(screen.queryByText(/Item undefined/)).toBeNull();
    expect(screen.queryByText("undefined")).toBeNull();

    const inner = container.querySelector('[role="list"]') as HTMLElement;
    expect(inner.style.height).toBe("2000px");
    expect(
      container.querySelectorAll('[role="listitem"]').length
    ).toBeLessThanOrEqual(50);
  });

  it("hydrates without logging a hydration mismatch warning", () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const element = (
        <VirtualRenderWave
          items={items(1000)}
          itemHeight={40}
          containerHeight={400}
          batchSize={1000}
          getItemKey={(_item, index) => index}
          renderItem={(item) => <div>{item}</div>}
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

      // React 18 also logs an unrelated useLayoutEffect warning while
      // renderToString runs in jsdom, so asserting "not called at all" would
      // be wrong; filter for calls that actually mention hydration. That
      // warning has to be named to be excluded: its own text says the effect
      // "will lead to a mismatch between the initial, non-hydrated UI and the
      // intended UI", which matches on "hydrat" as well.
      const hydrationWarnings = errorSpy.mock.calls.filter(
        (call) =>
          String(call[0]).toLowerCase().includes("hydrat") &&
          !String(call[0]).includes(
            "useLayoutEffect does nothing on the server"
          )
      );
      expect(hydrationWarnings).toEqual([]);

      act(() => {
        root?.unmount();
      });
      container.remove();
    } finally {
      errorSpy.mockRestore();
    }
  });
});
