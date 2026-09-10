import { act, render, screen } from "@testing-library/react";
import { createRef, forwardRef, version as reactVersion } from "react";
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
  WrapperComponent,
  WrapperProps,
} from "../src/types";

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

// React 18 strips `ref` from the props of a plain function component, so only
// the forwardRef form works there.
const onReact19 = Number.parseInt(reactVersion, 10) >= 19 ? it : it.skip;
const onReact18 = Number.parseInt(reactVersion, 10) >= 19 ? it.skip : it;

const ForwardedSection = forwardRef<HTMLElement, WrapperProps>(
  function ForwardedSection({ children, ...rest }, ref) {
    return (
      <section data-testid="outer" ref={ref} {...rest}>
        {children}
      </section>
    );
  }
);

function PlainSection({ children, ...rest }: WrapperProps) {
  return (
    <section data-testid="outer" {...rest}>
      {children}
    </section>
  );
}

// Takes the ref and drops it on the floor, the way a wrapper that forgets to
// attach it does.
const RefLosingSection = forwardRef<HTMLElement, WrapperProps>(
  function RefLosingSection({ children, ...rest }, _ref) {
    return <section {...rest}>{children}</section>;
  }
);

const REF_LOST_MESSAGE =
  "react-render-wave: outerElement did not attach the ref it received, so " +
  "the list cannot scroll or measure. On React 18 wrap the component in " +
  "forwardRef and pass the ref to your DOM node.";

// Five natural shapes for a custom outerElement/innerElement, each typed as a
// WrapperComponent so that tsc covers them as well as the runtime assertions.

// Shape 1: forwardRef<HTMLElement, WrapperProps> rendering a <section>.
const ForwardRefSection: WrapperComponent = forwardRef<
  HTMLElement,
  WrapperProps
>(function ForwardRefSection({ children, ...rest }, ref) {
  return (
    <section data-testid="outer" ref={ref} {...rest}>
      {children}
    </section>
  );
});

// Shape 2: forwardRef<HTMLDivElement, WrapperProps> rendering a
// <div ref={ref}>. Before the fix, WrapperProps.ref was typed narrower than
// a forwardRef render function's own ref parameter, so this did not compile.
const ForwardRefDiv: WrapperComponent = forwardRef<
  HTMLDivElement,
  WrapperProps
>(function ForwardRefDiv({ children, ...rest }, ref) {
  return (
    <div data-testid="outer" ref={ref} {...rest}>
      {children}
    </div>
  );
});

// Shape 3: FC<WrapperProps> putting the ref straight on the node as a prop,
// the React 19 ref-as-prop style. Before the fix, WrapperProps.ref did not
// exist as a plain prop a function component could read, so this did not
// compile.
const RefAsPropDiv: WrapperComponent = function RefAsPropDiv(
  props: WrapperProps
) {
  const { children, ref, ...rest } = props;
  return (
    <div data-testid="outer" ref={ref} {...rest}>
      {children}
    </div>
  );
};

// Shape 4: FC<WrapperProps> whose body reads props.ref?.current, the pattern
// a 3.0.0 consumer may have written against the old, narrower ref type.
// Before the fix, `.current` did not compile on WrapperProps.ref.
const ReadsRefCurrentDiv: WrapperComponent = function ReadsRefCurrentDiv(
  props: WrapperProps
) {
  const { children, ref, ...rest } = props;
  const alreadyMounted = Boolean(ref?.current);
  return (
    <div
      data-testid="outer"
      data-already-mounted={alreadyMounted}
      ref={ref}
      {...rest}
    >
      {children}
    </div>
  );
};

// Shape 5: a plain arrow function component. It destructures `ref` off the
// props but never attaches it anywhere, the way a caller who has not read
// the ref-forwarding note would write it. (Spreading the rest of the props,
// ref included, would forward it on React 19 through the JSX spread the way
// the FC fixture above does; this fixture drops it on purpose so the shape
// is deterministic across both React versions.)
const ArrowDiv: WrapperComponent = (props: WrapperProps) => {
  const { children, ref: _ref, ...rest } = props;
  return (
    <div data-testid="outer" {...rest}>
      {children}
    </div>
  );
};

describe("VirtualRenderWave wrapper elements", () => {
  it("renders string tags and still scrolls", () => {
    const { container } = render(
      <VirtualRenderWave
        items={items(1000)}
        itemHeight={40}
        containerHeight={400}
        overscan={5}
        batchSize={1000}
        outerElement="section"
        innerElement="ul"
        renderItem={(item) => <div>{item}</div>}
      />
    );
    const outer = container.firstElementChild as HTMLElement;
    expect(outer.tagName).toBe("SECTION");
    expect(container.querySelector('[role="list"]')?.tagName).toBe("UL");
    expect(screen.getAllByRole("listitem")).toHaveLength(15);

    scrollTo(outer, 4000);

    expect(screen.queryByText("Item 0")).toBeNull();
    expect(screen.getByText("Item 100")).toBeTruthy();
  });

  it("attaches the ref of a forwardRef outerElement", () => {
    const handle = createRef<VirtualRenderWaveHandle>();
    render(
      <VirtualRenderWave
        ref={handle}
        items={items(1000)}
        itemHeight={40}
        containerHeight={400}
        overscan={5}
        batchSize={1000}
        outerElement={ForwardedSection}
        renderItem={(item) => <div>{item}</div>}
      />
    );
    const outer = screen.getByTestId("outer");
    expect(outer.tagName).toBe("SECTION");
    expect(handle.current?.getScrollElement()).toBe(outer);

    scrollTo(outer, 4000);

    expect(screen.queryByText("Item 0")).toBeNull();
    expect(screen.getByText("Item 100")).toBeTruthy();
  });

  onReact19("attaches the ref of a plain function outerElement", () => {
    const handle = createRef<VirtualRenderWaveHandle>();
    render(
      <VirtualRenderWave
        ref={handle}
        items={items(1000)}
        itemHeight={40}
        containerHeight={400}
        overscan={5}
        batchSize={1000}
        outerElement={PlainSection}
        renderItem={(item) => <div>{item}</div>}
      />
    );
    const outer = screen.getByTestId("outer");
    expect(handle.current?.getScrollElement()).toBe(outer);

    scrollTo(outer, 4000);

    expect(screen.getByText("Item 100")).toBeTruthy();
  });

  it("reports an outerElement that swallows the ref, once", () => {
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      render(
        <VirtualRenderWave
          items={items(1000)}
          itemHeight={40}
          containerHeight={400}
          overscan={5}
          batchSize={1000}
          outerElement={RefLosingSection}
          renderItem={(item) => <div>{item}</div>}
        />
      );

      // React itself may warn about the dropped ref as well, so match on ours.
      const ours = errors.mock.calls.filter((call) =>
        String(call[0]).includes("outerElement did not attach the ref")
      );
      expect(ours).toHaveLength(1);
      expect(ours[0][0]).toBe(REF_LOST_MESSAGE);
      // Rows still render; only scrolling and measuring are lost.
      expect(screen.getAllByRole("listitem")).toHaveLength(15);
    } finally {
      errors.mockRestore();
    }
  });
});

describe("WrapperProps ref shapes", () => {
  it("shape 1: forwardRef<HTMLElement, WrapperProps> rendering a <section> scrolls and measures", () => {
    const handle = createRef<VirtualRenderWaveHandle>();
    render(
      <VirtualRenderWave
        ref={handle}
        items={items(1000)}
        itemHeight={40}
        containerHeight={400}
        overscan={5}
        batchSize={1000}
        outerElement={ForwardRefSection}
        renderItem={(item) => <div>{item}</div>}
      />
    );
    const outer = screen.getByTestId("outer");
    expect(outer.tagName).toBe("SECTION");
    expect(handle.current?.getScrollElement()).toBe(outer);

    scrollTo(outer, 4000);

    expect(screen.queryByText("Item 0")).toBeNull();
    expect(screen.getByText("Item 100")).toBeTruthy();
  });

  it("shape 2: forwardRef<HTMLDivElement, WrapperProps> rendering a <div ref={ref}> scrolls and measures", () => {
    const handle = createRef<VirtualRenderWaveHandle>();
    render(
      <VirtualRenderWave
        ref={handle}
        items={items(1000)}
        itemHeight={40}
        containerHeight={400}
        overscan={5}
        batchSize={1000}
        outerElement={ForwardRefDiv}
        renderItem={(item) => <div>{item}</div>}
      />
    );
    const outer = screen.getByTestId("outer");
    expect(outer.tagName).toBe("DIV");
    expect(handle.current?.getScrollElement()).toBe(outer);

    scrollTo(outer, 4000);

    expect(screen.queryByText("Item 0")).toBeNull();
    expect(screen.getByText("Item 100")).toBeTruthy();
  });

  onReact19(
    "shape 3: FC<WrapperProps> putting the ref on the node as a prop scrolls and measures (React 19 only)",
    () => {
      const handle = createRef<VirtualRenderWaveHandle>();
      render(
        <VirtualRenderWave
          ref={handle}
          items={items(1000)}
          itemHeight={40}
          containerHeight={400}
          overscan={5}
          batchSize={1000}
          outerElement={RefAsPropDiv}
          renderItem={(item) => <div>{item}</div>}
        />
      );
      const outer = screen.getByTestId("outer");
      expect(handle.current?.getScrollElement()).toBe(outer);

      scrollTo(outer, 4000);

      expect(screen.queryByText("Item 0")).toBeNull();
      expect(screen.getByText("Item 100")).toBeTruthy();
    }
  );

  onReact18(
    "shape 3 on React 18: props.ref never arrives, so the ref-loss warning fires and rows still render",
    () => {
      const errors = vi.spyOn(console, "error").mockImplementation(() => {});
      try {
        const handle = createRef<VirtualRenderWaveHandle>();
        render(
          <VirtualRenderWave
            ref={handle}
            items={items(1000)}
            itemHeight={40}
            containerHeight={400}
            overscan={5}
            batchSize={1000}
            outerElement={RefAsPropDiv}
            renderItem={(item) => <div>{item}</div>}
          />
        );
        expect(handle.current?.getScrollElement()).toBeNull();
        const ours = errors.mock.calls.filter((call) =>
          String(call[0]).includes("outerElement did not attach the ref")
        );
        expect(ours).toHaveLength(1);
        expect(screen.getAllByRole("listitem")).toHaveLength(15);
      } finally {
        errors.mockRestore();
      }
    }
  );

  onReact19(
    "shape 4: FC<WrapperProps> reading props.ref?.current scrolls and measures (React 19 only)",
    () => {
      const handle = createRef<VirtualRenderWaveHandle>();
      render(
        <VirtualRenderWave
          ref={handle}
          items={items(1000)}
          itemHeight={40}
          containerHeight={400}
          overscan={5}
          batchSize={1000}
          outerElement={ReadsRefCurrentDiv}
          renderItem={(item) => <div>{item}</div>}
        />
      );
      const outer = screen.getByTestId("outer");
      expect(handle.current?.getScrollElement()).toBe(outer);

      scrollTo(outer, 4000);

      expect(screen.queryByText("Item 0")).toBeNull();
      expect(screen.getByText("Item 100")).toBeTruthy();
    }
  );

  it("shape 5: a plain arrow function component never forwards the ref, so scrolling and measuring are lost", () => {
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const handle = createRef<VirtualRenderWaveHandle>();
      render(
        <VirtualRenderWave
          ref={handle}
          items={items(1000)}
          itemHeight={40}
          containerHeight={400}
          overscan={5}
          batchSize={1000}
          outerElement={ArrowDiv}
          renderItem={(item) => <div>{item}</div>}
        />
      );
      const outer = screen.getByTestId("outer");
      expect(outer.tagName).toBe("DIV");
      expect(handle.current?.getScrollElement()).toBeNull();
      const ours = errors.mock.calls.filter((call) =>
        String(call[0]).includes("outerElement did not attach the ref")
      );
      expect(ours).toHaveLength(1);
      // Rows still render; only scrolling and measuring are lost.
      expect(screen.getAllByRole("listitem")).toHaveLength(15);
    } finally {
      errors.mockRestore();
    }
  });
});
