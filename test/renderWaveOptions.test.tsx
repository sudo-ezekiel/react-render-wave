import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RenderWave } from "../src/RenderWave";

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

const advanceWave = (ms = 100) => {
  act(() => {
    vi.advanceTimersByTime(ms);
  });
};

describe("RenderWave options (regression net for the windowing refactor)", () => {
  it("pauses the reveal while disabled and resumes once enabled again", () => {
    const list = Array.from({ length: 60 }, (_, i) => `Item ${i}`);
    const { rerender } = render(
      <RenderWave
        items={list}
        batchSize={20}
        interval={50}
        enabled={false}
        renderItem={(item, i) => <div key={i}>{item}</div>}
      />
    );

    expect(screen.getAllByText(/^Item /)).toHaveLength(20);
    advanceWave(200);
    expect(screen.getAllByText(/^Item /)).toHaveLength(20);

    rerender(
      <RenderWave
        items={list}
        batchSize={20}
        interval={50}
        enabled
        renderItem={(item, i) => <div key={i}>{item}</div>}
      />
    );
    advanceWave();
    expect(screen.getAllByText(/^Item /)).toHaveLength(40);
  });

  it("reveals from startIndex in batches", () => {
    const list = Array.from({ length: 10 }, (_, i) => `Item ${i}`);
    render(
      <RenderWave
        items={list}
        batchSize={2}
        interval={50}
        startIndex={4}
        renderItem={(item, i) => <div key={i}>{item}</div>}
      />
    );

    expect(screen.getByText("Item 4")).toBeTruthy();
    expect(screen.getByText("Item 5")).toBeTruthy();
    expect(screen.queryByText("Item 6")).toBeNull();
    expect(screen.queryByText("Item 0")).toBeNull();
    expect(screen.getAllByText(/^Item /)).toHaveLength(2);

    advanceWave();

    expect(screen.getByText("Item 6")).toBeTruthy();
    expect(screen.getByText("Item 7")).toBeTruthy();
    expect(screen.queryByText("Item 8")).toBeNull();
    expect(screen.getAllByText(/^Item /)).toHaveLength(4);
  });

  it("never calls renderItem with an out-of-range item when items shrink mid-reveal", () => {
    const big = Array.from({ length: 60 }, (_, i) => `Item ${i}`);
    const renderItem = vi.fn((item: string, i: number) => (
      <div key={i}>{item}</div>
    ));
    const { rerender } = render(
      <RenderWave
        items={big}
        batchSize={20}
        interval={50}
        renderItem={renderItem}
      />
    );
    advanceWave();
    renderItem.mockClear();

    const small = Array.from({ length: 10 }, (_, i) => `Item ${i}`);
    rerender(
      <RenderWave
        items={small}
        batchSize={20}
        interval={50}
        renderItem={renderItem}
      />
    );

    expect(renderItem.mock.calls.length).toBeGreaterThan(0);
    for (const call of renderItem.mock.calls) {
      expect(call[0]).toBeDefined();
    }
  });
});
