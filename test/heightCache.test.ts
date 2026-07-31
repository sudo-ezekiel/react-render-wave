import { describe, expect, it } from "vitest";
import { HeightCache } from "../src/heightCache";

describe("HeightCache", () => {
  it("computes offsets and total from the default size", () => {
    const cache = new HeightCache(40);
    cache.setCount(10);
    expect(cache.offsetOf(0)).toBe(0);
    expect(cache.offsetOf(3)).toBe(120);
    expect(cache.totalSize()).toBe(400);
  });

  it("clamps offsetOf outside the range", () => {
    const cache = new HeightCache(40);
    cache.setCount(5);
    expect(cache.offsetOf(-2)).toBe(0);
    expect(cache.offsetOf(99)).toBe(200);
  });

  it("incorporates measurements into offsets", () => {
    const cache = new HeightCache(40);
    cache.setCount(10);
    expect(cache.totalSize()).toBe(400);

    expect(cache.measure(2, 100)).toBe(true);
    expect(cache.offsetOf(2)).toBe(80);
    expect(cache.offsetOf(3)).toBe(180);
    expect(cache.totalSize()).toBe(460);
  });

  it("reports unchanged measurements as no-ops", () => {
    const cache = new HeightCache(40);
    cache.setCount(10);
    cache.measure(2, 100);
    expect(cache.measure(2, 100)).toBe(false);
    expect(cache.measure(-1, 100)).toBe(false);
    expect(cache.measure(10, 100)).toBe(false);
  });

  it("finds the item at an offset with boundary offsets belonging to the next item", () => {
    const cache = new HeightCache(40);
    cache.setCount(100);
    expect(cache.indexAt(-10)).toBe(0);
    expect(cache.indexAt(0)).toBe(0);
    expect(cache.indexAt(39)).toBe(0);
    expect(cache.indexAt(40)).toBe(1);
    expect(cache.indexAt(3999)).toBe(99);
    expect(cache.indexAt(999999)).toBe(99);
  });

  it("hit tests correctly with mixed heights", () => {
    const cache = new HeightCache(40);
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
    const cache = new HeightCache(40);
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
    const cache = new HeightCache(40);
    cache.setCount(10);
    cache.measure(0, 100);
    expect(cache.totalSize()).toBe(460);

    cache.setDefaultSize(50);
    expect(cache.totalSize()).toBe(100 + 9 * 50);
    expect(cache.offsetOf(2)).toBe(150);
  });

  it("handles an empty list", () => {
    const cache = new HeightCache(40);
    expect(cache.totalSize()).toBe(0);
    expect(cache.indexAt(100)).toBe(0);
    expect(cache.offsetOf(0)).toBe(0);
  });
});
