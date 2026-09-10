// @vitest-environment node
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RenderWave } from "../src/RenderWave";
import { VirtualRenderWave } from "../src/VirtualRenderWave";

// This whole file runs in the node test environment: window, document and
// Element are all undefined here, which is exactly the branch the library
// takes for real server rendering (it swaps useLayoutEffect for useEffect by
// checking typeof window).

const items = (n: number) => Array.from({ length: n }, (_, i) => `Item ${i}`);

let errorSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  errorSpy.mockRestore();
});

describe("server rendering", () => {
  it("RenderWave emits exactly the first batch and is deterministic across calls", () => {
    const element = (
      <RenderWave
        items={items(100)}
        batchSize={20}
        renderItem={(item, i) => (
          <span key={i} data-item={i}>
            {item}
          </span>
        )}
      />
    );

    const first = renderToString(element);
    const second = renderToString(element);

    const count = (first.match(/data-item="\d+"/g) ?? []).length;
    expect(count).toBe(20);
    expect(second).toBe(first);
  });

  it("VirtualRenderWave emits the visible window with the right total height and aria attributes, deterministically", () => {
    const element = (
      <VirtualRenderWave
        items={items(1000)}
        itemHeight={40}
        containerHeight={400}
        batchSize={1000}
        renderItem={(item) => <div>{item}</div>}
      />
    );

    const first = renderToString(element);
    const second = renderToString(element);

    expect(first).toContain('role="list"');
    expect(first).toContain("height:40000px");

    const listitems = first.match(/role="listitem"/g) ?? [];
    expect(listitems).toHaveLength(15);

    const setsizes = first.match(/aria-setsize="1000"/g) ?? [];
    expect(setsizes).toHaveLength(15);

    expect(second).toBe(first);
  });

  it("logs nothing through console.error while rendering either component on the server", () => {
    renderToString(
      <RenderWave
        items={items(20)}
        batchSize={5}
        renderItem={(item, i) => <span key={i}>{item}</span>}
      />
    );
    renderToString(
      <VirtualRenderWave
        items={items(100)}
        itemHeight={40}
        containerHeight={400}
        batchSize={100}
        renderItem={(item) => <div>{item}</div>}
      />
    );

    expect(errorSpy).not.toHaveBeenCalled();
  });

  it("VirtualRenderWave with renderSkeleton splits the first window between revealed items and skeletons", () => {
    const markup = renderToString(
      <VirtualRenderWave
        items={items(50)}
        itemHeight={40}
        containerHeight={400}
        batchSize={5}
        renderItem={(item) => <div data-kind="item">{item}</div>}
        renderSkeleton={(i) => <div data-kind="skeleton">Skeleton {i}</div>}
      />
    );

    const revealedCount = (markup.match(/data-kind="item"/g) ?? []).length;
    const skeletonCount = (markup.match(/data-kind="skeleton"/g) ?? []).length;

    expect(revealedCount).toBe(5);
    expect(skeletonCount).toBe(10);
  });
});
