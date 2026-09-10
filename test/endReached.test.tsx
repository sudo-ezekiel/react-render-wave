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
import { VirtualRenderWave } from "../src/VirtualRenderWave";

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

const flush = () => {
  act(() => {
    vi.advanceTimersByTime(20);
  });
};

const props = (count: number, onEndReached: () => void) => ({
  items: items(count),
  itemHeight: 40,
  containerHeight: 400,
  batchSize: 100,
  onEndReached,
  renderItem: (item: string) => <div>{item}</div>,
});

describe("onEndReached", () => {
  it("fires on mount when the content is shorter than the viewport", () => {
    const onEndReached = vi.fn();
    // 5 rows of 40px never fill a 400px viewport, so no scroll event is ever
    // dispatched to report the end.
    render(<VirtualRenderWave {...props(5, onEndReached)} />);
    flush();
    expect(onEndReached).toHaveBeenCalledTimes(1);
  });

  it("fires again when a page arrives that still leaves the list short", () => {
    const onEndReached = vi.fn();
    const { rerender } = render(
      <VirtualRenderWave {...props(5, onEndReached)} />
    );
    flush();
    expect(onEndReached).toHaveBeenCalledTimes(1);

    rerender(<VirtualRenderWave {...props(8, onEndReached)} />);
    flush();
    expect(onEndReached).toHaveBeenCalledTimes(2);
  });

  it("does not fire again when the item count is unchanged", () => {
    const onEndReached = vi.fn();
    const { rerender } = render(
      <VirtualRenderWave {...props(8, onEndReached)} />
    );
    flush();
    expect(onEndReached).toHaveBeenCalledTimes(1);

    rerender(<VirtualRenderWave {...props(8, onEndReached)} />);
    flush();
    expect(onEndReached).toHaveBeenCalledTimes(1);
  });

  it("does not fire on mount when the content overflows the viewport", () => {
    const onEndReached = vi.fn();
    render(<VirtualRenderWave {...props(100, onEndReached)} />);
    flush();
    expect(onEndReached).not.toHaveBeenCalled();
  });

  it("honours endReachedThreshold", () => {
    const onEndReached = vi.fn();
    const { container } = render(
      <VirtualRenderWave
        {...props(100, onEndReached)}
        endReachedThreshold={100}
      />
    );
    const outer = container.firstElementChild as HTMLElement;

    // 3400 + 400 is 100px short of the 3900px trigger point.
    scrollTo(outer, 3400);
    expect(onEndReached).not.toHaveBeenCalled();

    scrollTo(outer, 3550);
    expect(onEndReached).toHaveBeenCalledTimes(1);
  });
});
