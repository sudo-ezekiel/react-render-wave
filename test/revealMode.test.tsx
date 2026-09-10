import { act, render, screen } from "@testing-library/react";
import { createRef, type Ref } from "react";
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

/** Interval 50 plus the frame the wave is committed on. */
const wave = () => {
  act(() => {
    vi.advanceTimersByTime(100);
  });
};

const shown = (index: number) => screen.queryByText(`Item ${index}`) !== null;
const skeleton = (index: number) =>
  screen.queryByText(`Skeleton ${index}`) !== null;

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

describe("revealMode", () => {
  it("reveals the rendered window in batches and never re-hides a row", () => {
    const ref = createRef<VirtualRenderWaveHandle>();
    const { container } = render(list({ revealMode: "viewport", ref }));
    const outer = container.firstElementChild as HTMLElement;

    // The first batch of the window is revealed during the first render.
    expect(shown(4)).toBe(true);
    expect(shown(5)).toBe(false);
    expect(skeleton(5)).toBe(true);
    expect(skeleton(14)).toBe(true);

    wave();
    expect(shown(9)).toBe(true);
    expect(shown(10)).toBe(false);

    // A jump to a part of the list nobody has seen: the new window starts as
    // skeletons and is revealed by the waves that follow.
    scrollTo(outer, 4000);
    expect(shown(95)).toBe(false);
    expect(shown(114)).toBe(false);
    expect(skeleton(95)).toBe(true);
    expect(skeleton(114)).toBe(true);

    wave();
    expect(shown(95)).toBe(true);
    expect(shown(99)).toBe(true);
    expect(shown(100)).toBe(false);

    // Back to the top: every row revealed on the way out is still revealed,
    // so nothing the reader has already seen re-staggers. The rows that were
    // never reached are picked up by the next wave.
    scrollTo(outer, 0);
    for (let i = 0; i < 10; i++) expect(shown(i)).toBe(true);
    expect(shown(10)).toBe(false);
    expect(ref.current?.getVisibleIndexes()).toEqual([
      0, 1, 2, 3, 4, 5, 6, 7, 8, 9,
    ]);

    wave();
    for (let i = 0; i < 15; i++) expect(shown(i)).toBe(true);
    expect(ref.current?.getVisibleIndexes()).toEqual(
      Array.from({ length: 15 }, (_, i) => i)
    );
  });

  it("lists only the revealed rows of the window in getVisibleIndexes", () => {
    const ref = createRef<VirtualRenderWaveHandle>();
    render(list({ revealMode: "viewport", ref }));

    expect(ref.current?.getVisibleIndexes()).toEqual([0, 1, 2, 3, 4]);

    wave();
    expect(ref.current?.getVisibleIndexes()).toEqual([
      0, 1, 2, 3, 4, 5, 6, 7, 8, 9,
    ]);
  });

  it("counts from startIndex regardless of the scroll position by default", () => {
    const ref = createRef<VirtualRenderWaveHandle>();
    const { container } = render(list({ ref }));
    const outer = container.firstElementChild as HTMLElement;

    expect(shown(4)).toBe(true);
    expect(shown(5)).toBe(false);

    // The window moves, but the wave is still counting from the start of the
    // list, so every row here is a skeleton.
    scrollTo(outer, 4000);
    expect(skeleton(95)).toBe(true);
    expect(skeleton(114)).toBe(true);
    expect(ref.current?.getVisibleIndexes()).toEqual([]);

    wave();
    expect(skeleton(95)).toBe(true);

    scrollTo(outer, 0);
    expect(shown(0)).toBe(true);
    expect(shown(9)).toBe(true);
    expect(shown(10)).toBe(false);
  });
});
