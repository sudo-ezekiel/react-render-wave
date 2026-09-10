import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

afterEach(() => {
  cleanup();
});

type ROCallback = (
  entries: Array<{ target: Element }>,
  observer: MockResizeObserver
) => void;

/**
 * jsdom has no ResizeObserver. This stub records instances and observed
 * elements so tests can trigger measurements by hand via `trigger`.
 */
export class MockResizeObserver {
  static instances: MockResizeObserver[] = [];
  observed = new Set<Element>();

  constructor(private callback: ROCallback) {
    MockResizeObserver.instances.push(this);
  }

  observe(el: Element): void {
    this.observed.add(el);
  }

  unobserve(el: Element): void {
    this.observed.delete(el);
  }

  disconnect(): void {
    this.observed.clear();
  }

  trigger(elements?: Element[]): void {
    const targets = elements ?? Array.from(this.observed);
    this.callback(
      targets.map((target) => ({ target })),
      this
    );
  }
}

(globalThis as { ResizeObserver?: unknown }).ResizeObserver =
  MockResizeObserver;

afterEach(() => {
  MockResizeObserver.instances = [];
});

// jsdom has no scrollTo. This stub applies the offset and fires a scroll event.
// The node environment used by the SSR suites has no Element at all, hence the guard.
if (typeof Element !== "undefined") {
  Element.prototype.scrollTo = function scrollTo(
    this: Element,
    options?: ScrollToOptions | number,
    y?: number
  ) {
    const top =
      typeof options === "object" && options !== null
        ? options.top ?? this.scrollTop
        : y ?? 0;
    this.scrollTop = top;
    this.dispatchEvent(new Event("scroll"));
  } as Element["scrollTo"];
}
