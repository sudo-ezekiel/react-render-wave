import { describe, expect, it } from "vitest";
import { SizeCache } from "../src/sizeCache";

describe("SizeCache", () => {
  it("computes offsets and total from the default size", () => {
    const cache = new SizeCache(40);
    cache.setCount(10);
    expect(cache.offsetOf(0)).toBe(0);
    expect(cache.offsetOf(3)).toBe(120);
    expect(cache.totalSize()).toBe(400);
  });

  it("clamps offsetOf outside the range", () => {
    const cache = new SizeCache(40);
    cache.setCount(5);
    expect(cache.offsetOf(-2)).toBe(0);
    expect(cache.offsetOf(99)).toBe(200);
  });

  it("incorporates measurements into offsets", () => {
    const cache = new SizeCache(40);
    cache.setCount(10);
    expect(cache.totalSize()).toBe(400);

    expect(cache.measure(2, 100)).toBe(true);
    expect(cache.offsetOf(2)).toBe(80);
    expect(cache.offsetOf(3)).toBe(180);
    expect(cache.totalSize()).toBe(460);
  });

  it("reports unchanged measurements as no-ops", () => {
    const cache = new SizeCache(40);
    cache.setCount(10);
    cache.measure(2, 100);
    expect(cache.measure(2, 100)).toBe(false);
    expect(cache.measure(-1, 100)).toBe(false);
    expect(cache.measure(10, 100)).toBe(false);
  });

  it("finds the item at an offset with boundary offsets belonging to the next item", () => {
    const cache = new SizeCache(40);
    cache.setCount(100);
    expect(cache.indexAt(-10)).toBe(0);
    expect(cache.indexAt(0)).toBe(0);
    expect(cache.indexAt(39)).toBe(0);
    expect(cache.indexAt(40)).toBe(1);
    expect(cache.indexAt(3999)).toBe(99);
    expect(cache.indexAt(999999)).toBe(99);
  });

  it("hit tests correctly with mixed sizes", () => {
    const cache = new SizeCache(40);
    cache.setCount(5);
    cache.measure(0, 10);
    cache.measure(1, 200);
    // Layout: [0..10) [10..210) [210..250) [250..290) [290..330)
    expect(cache.indexAt(5)).toBe(0);
    expect(cache.indexAt(10)).toBe(1);
    expect(cache.indexAt(209)).toBe(1);
    expect(cache.indexAt(210)).toBe(2);
    expect(cache.totalSize()).toBe(330);
  });

  it("handles count changes in both directions", () => {
    const cache = new SizeCache(40);
    cache.setCount(10);
    cache.measure(9, 100);
    expect(cache.totalSize()).toBe(460);

    cache.setCount(4);
    expect(cache.totalSize()).toBe(160);

    cache.setCount(12);
    // The measurement for index 9 persists across the shrink and regrow.
    expect(cache.totalSize()).toBe(40 * 11 + 100);
  });

  it("invalidates everything when the default size changes", () => {
    const cache = new SizeCache(40);
    cache.setCount(10);
    cache.measure(0, 100);
    expect(cache.totalSize()).toBe(460);

    cache.setDefaultSize(50);
    expect(cache.totalSize()).toBe(100 + 9 * 50);
    expect(cache.offsetOf(2)).toBe(150);
  });

  it("handles an empty list", () => {
    const cache = new SizeCache(40);
    expect(cache.totalSize()).toBe(0);
    expect(cache.indexAt(100)).toBe(0);
    expect(cache.offsetOf(0)).toBe(0);
  });

  it("carries keyed sizes along when the data is reordered", () => {
    const cache = new SizeCache(40);
    cache.setCount(3);
    const first = ["a", "b", "c"];
    cache.setKeyFn((i) => first[i]);
    expect(cache.keyOf(0)).toBe("a");
    expect(cache.measure(0, 100)).toBe(true);
    expect(cache.totalSize()).toBe(180);
    expect(cache.offsetOf(1)).toBe(100);

    const swapped = ["b", "a", "c"];
    cache.setKeyFn((i) => swapped[i]);
    expect(cache.sizeOf(0)).toBe(40);
    expect(cache.sizeOf(1)).toBe(100);
    expect(cache.offsetOf(1)).toBe(40);
    expect(cache.offsetOf(2)).toBe(140);
    expect(cache.totalSize()).toBe(180);
  });

  it("drops measurements when the keying mode toggles", () => {
    const cache = new SizeCache(40);
    cache.setCount(3);
    cache.measure(0, 100);
    expect(cache.totalSize()).toBe(180);

    // Index keys and item keys share one map, so they never mix.
    cache.setKeyFn((i) => ["a", "b", "c"][i]);
    expect(cache.sizeOf(0)).toBe(40);
    expect(cache.totalSize()).toBe(120);

    cache.measure(0, 100);
    expect(cache.totalSize()).toBe(180);
    cache.setKeyFn(undefined);
    expect(cache.totalSize()).toBe(120);
  });

  it("keeps sizes when the key function identity changes but the mapping does not", () => {
    const cache = new SizeCache(40);
    cache.setCount(3);
    const keys = ["a", "b", "c"];
    cache.setKeyFn((i) => keys[i]);
    cache.measure(1, 90);
    expect(cache.totalSize()).toBe(170);

    cache.setKeyFn((i) => keys[i]);
    expect(cache.sizeOf(1)).toBe(90);
    expect(cache.offsetOf(2)).toBe(130);
    expect(cache.totalSize()).toBe(170);
  });

  it("records a measurement under a key snapshot taken before a move", () => {
    const cache = new SizeCache(40);
    cache.setCount(3);
    let order = ["a", "b", "c"];
    cache.setKeyFn((i) => order[i]);
    expect(cache.measureKey("a", 0, 100)).toBe(true);
    expect(cache.measureKey("a", 0, 100)).toBe(false);
    expect(cache.sizeOf(0)).toBe(100);

    order = ["b", "c", "a"];
    cache.setKeyFn((i) => order[i]);
    expect(cache.sizeOf(2)).toBe(100);

    // A measurement in flight across the move still lands on its own item.
    expect(cache.measureKey("a", 2, 120)).toBe(true);
    expect(cache.sizeOf(2)).toBe(120);
    expect(cache.totalSize()).toBe(200);
    expect(cache.measureKey("a", 3, 130)).toBe(false);
  });
});
