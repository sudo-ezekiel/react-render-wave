import { act, render, screen } from "@testing-library/react";
import { createRef, type ReactElement, type Ref } from "react";
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

/**
 * Markup of the very first render, before any effect has run. React 18 warns
 * about useLayoutEffect whenever renderToString runs in jsdom, which is noise
 * here rather than a finding, so it is swallowed.
 */
const firstRenderMarkup = (element: ReactElement) => {
  const errors = vi.spyOn(console, "error").mockImplementation(() => {});
  try {
    return renderToString(element);
  } finally {
    errors.mockRestore();
  }
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
    batchSize={1000}
    renderItem={(item) => <div>{item}</div>}
    {...props}
  />
);

describe("VirtualRenderWave scroll options", () => {
  it("opens at initialScrollOffset, from the very first render", () => {
    // The window is derived from the offset during render, so the server
    // markup and the first paint already show it: no jump after mount.
    const markup = firstRenderMarkup(list({ initialScrollOffset: 2000 }));
    expect(markup).toContain("Item 50");
    expect(markup).not.toContain(">Item 0<");

    const { container } = render(list({ initialScrollOffset: 2000 }));
    const outer = container.firstElementChild as HTMLElement;
    expect(outer.scrollTop).toBe(2000);
    expect(screen.getByText("Item 50")).toBeTruthy();
    expect(screen.queryByText("Item 0")).toBeNull();
  });

  it("opens at initialScrollIndex, from the very first render", () => {
    const markup = firstRenderMarkup(list({ initialScrollIndex: 50 }));
    expect(markup).toContain("Item 50");
    expect(markup).not.toContain(">Item 0<");

    const { container } = render(list({ initialScrollIndex: 50 }));
    const outer = container.firstElementChild as HTMLElement;
    expect(outer.scrollTop).toBe(2000);
    expect(screen.queryByText("Item 0")).toBeNull();
  });

  it("renders the target window on the first render of a controlled scrollToIndex", () => {
    const markup = firstRenderMarkup(list({ scrollToIndex: 50 }));
    expect(markup).toContain("Item 50");
    expect(markup).not.toContain(">Item 0<");

    const { container } = render(list({ scrollToIndex: 50 }));
    const outer = container.firstElementChild as HTMLElement;
    expect(outer.scrollTop).toBe(2000);
  });

  it("reports the rendered and visible range through onRangeChange", () => {
    const onRangeChange = vi.fn();
    const { container } = render(list({ onRangeChange }));
    const outer = container.firstElementChild as HTMLElement;

    expect(onRangeChange).toHaveBeenCalledTimes(1);
    expect(onRangeChange).toHaveBeenLastCalledWith({
      start: 0,
      end: 15,
      visibleStart: 0,
      visibleEnd: 10,
    });

    scrollTo(outer, 4000);
    expect(onRangeChange).toHaveBeenCalledTimes(2);
    expect(onRangeChange).toHaveBeenLastCalledWith({
      start: 95,
      end: 115,
      visibleStart: 100,
      visibleEnd: 110,
    });
  });

  it("takes an alignment or a behavior string on handle.scrollTo", () => {
    const ref = createRef<VirtualRenderWaveHandle>();
    const { container } = render(list({ ref }));
    const outer = container.firstElementChild as HTMLElement;

    act(() => {
      ref.current?.scrollTo(50, { align: "end", behavior: "auto" });
    });
    expect(outer.scrollTop).toBe(1640);

    act(() => {
      ref.current?.scrollTo(50, "auto");
    });
    expect(outer.scrollTop).toBe(2000);

    act(() => {
      ref.current?.scrollTo(0, "auto");
    });
    expect(outer.scrollTop).toBe(0);

    // The default is align "start" with a smooth scroll; the jsdom scrollTo
    // stub applies it instantly.
    act(() => {
      ref.current?.scrollTo(50);
    });
    expect(outer.scrollTop).toBe(2000);
  });
});
