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

describe("RenderWave", () => {
  it("renders items in growing batches", () => {
    const items = Array.from({ length: 60 }, (_, i) => `Item ${i}`);
    render(
      <RenderWave
        items={items}
        batchSize={20}
        interval={50}
        renderItem={(item, i) => <div key={i}>{item}</div>}
      />
    );

    expect(screen.getAllByText(/^Item /)).toHaveLength(20);
    advanceWave();
    expect(screen.getAllByText(/^Item /)).toHaveLength(40);
    advanceWave();
    expect(screen.getAllByText(/^Item /)).toHaveLength(60);
  });

  it("never calls renderItem with undefined items when the list is shorter than a batch", () => {
    const items = ["a", "b", "c"];
    const renderItem = vi.fn((item: string, i: number) => (
      <div key={i}>{item}</div>
    ));
    render(<RenderWave items={items} batchSize={20} renderItem={renderItem} />);

    expect(renderItem).toHaveBeenCalledTimes(3);
    for (const call of renderItem.mock.calls) {
      expect(call[0]).toBeDefined();
    }
    expect(screen.getAllByText(/^[abc]$/)).toHaveLength(3);
  });

  it("notifies completion", () => {
    const onComplete = vi.fn();
    const items = Array.from({ length: 25 }, (_, i) => i);
    render(
      <RenderWave
        items={items}
        batchSize={20}
        onComplete={onComplete}
        renderItem={(item) => <span key={item}>{item}</span>}
      />
    );
    expect(onComplete).not.toHaveBeenCalled();
    advanceWave();
    expect(onComplete).toHaveBeenCalledTimes(1);
  });
});
