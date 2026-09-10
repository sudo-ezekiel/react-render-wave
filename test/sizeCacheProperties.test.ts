import { describe, expect, it } from "vitest";
import { SizeCache } from "../src/sizeCache";

// A small deterministic seeded PRNG (mulberry32), so failures reproduce.
function mulberry32(seed: number): () => number {
  let state = seed | 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function randInt(rng: () => number, min: number, max: number): number {
  return min + Math.floor(rng() * (max - min + 1));
}

function shuffle<T>(rng: () => number, arr: T[]): T[] {
  const copy = arr.slice();
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

/** Brute force prefix sums (length count + 1, offsets[0] = 0) for a sizes array. */
function bruteOffsets(sizes: number[]): number[] {
  const offsets = [0];
  for (let i = 0; i < sizes.length; i++) offsets.push(offsets[i] + sizes[i]);
  return offsets;
}

/**
 * The last index in [0, count - 1] whose offset <= x, following the same
 * boundary rules as SizeCache#indexAt.
 */
function bruteIndexAt(offsets: number[], count: number, x: number): number {
  if (count === 0) return 0;
  if (x <= 0) return 0;
  let best = 0;
  for (let i = 0; i < count; i++) {
    if (offsets[i] <= x) best = i;
    else break;
  }
  return Math.min(best, count - 1);
}

describe("SizeCache properties", () => {
  it("matches a brute force prefix sum and hit test across 200 random scenarios", () => {
    const rng = mulberry32(1);
    for (let scenario = 0; scenario < 200; scenario++) {
      const count = randInt(rng, 0, 300);
      const defaultSize = randInt(rng, 1, 100);
      const cache = new SizeCache(defaultSize);
      cache.setCount(count);

      const sizes = new Array(count).fill(defaultSize);
      const order = shuffle(
        rng,
        Array.from({ length: count }, (_, i) => i)
      );
      const measureCount = randInt(rng, 0, count);
      for (let k = 0; k < measureCount; k++) {
        const index = order[k];
        const size = randInt(rng, 1, 200);
        sizes[index] = size;
        cache.measure(index, size);
      }

      const offsets = bruteOffsets(sizes);
      for (let i = 0; i <= count; i++) {
        expect(cache.offsetOf(i)).toBe(offsets[i]);
      }
      expect(cache.totalSize()).toBe(cache.offsetOf(count));
      expect(cache.totalSize()).toBe(offsets[count]);

      const total = offsets[count];
      for (let q = 0; q < 50; q++) {
        const x = randInt(rng, -10, total + 10);
        expect(cache.indexAt(x)).toBe(bruteIndexAt(offsets, count, x));
      }
    }
  });

  it("gives the same answers whether measurements are interleaved with queries or not", () => {
    const rng = mulberry32(2);
    for (let scenario = 0; scenario < 100; scenario++) {
      const count = randInt(rng, 1, 100);
      const defaultSize = randInt(rng, 1, 80);
      const cache = new SizeCache(defaultSize);
      cache.setCount(count);

      const finalSizes = new Array(count).fill(defaultSize);

      const applyRandomMeasurements = () => {
        const batch = randInt(rng, 0, count);
        for (let k = 0; k < batch; k++) {
          const index = randInt(rng, 0, count - 1);
          const size = randInt(rng, 1, 150);
          finalSizes[index] = size;
          cache.measure(index, size);
        }
      };

      applyRandomMeasurements();
      // Interleave some queries that force a partial rebuild.
      for (let q = 0; q < 5; q++) {
        cache.offsetOf(randInt(rng, 0, count));
        cache.indexAt(randInt(rng, 0, defaultSize * count));
      }
      applyRandomMeasurements();
      for (let q = 0; q < 5; q++) {
        cache.offsetOf(randInt(rng, 0, count));
      }

      const fresh = new SizeCache(defaultSize);
      fresh.setCount(count);
      for (let i = 0; i < count; i++) fresh.measure(i, finalSizes[i]);

      for (let i = 0; i <= count; i++) {
        expect(cache.offsetOf(i)).toBe(fresh.offsetOf(i));
      }
      expect(cache.totalSize()).toBe(fresh.totalSize());

      const total = fresh.totalSize();
      for (let q = 0; q < 20; q++) {
        const x = randInt(rng, -10, total + 10);
        expect(cache.indexAt(x)).toBe(fresh.indexAt(x));
      }
    }
  });

  it("drops offsets beyond a shrunk count and restores measured sizes on regrow", () => {
    const rng = mulberry32(3);
    for (let scenario = 0; scenario < 30; scenario++) {
      const defaultSize = randInt(rng, 1, 60);
      const cache = new SizeCache(defaultSize);
      let count = 0;
      const measured = new Map<number, number>();

      const bruteTotal = () => {
        let total = 0;
        for (let i = 0; i < count; i++) total += measured.get(i) ?? defaultSize;
        return total;
      };

      const steps = randInt(rng, 5, 15);
      for (let s = 0; s < steps; s++) {
        if (rng() < 0.4) {
          count = randInt(rng, 0, 50);
          cache.setCount(count);
        } else if (count > 0) {
          const index = randInt(rng, 0, count - 1);
          const size = randInt(rng, 1, 200);
          measured.set(index, size);
          cache.measure(index, size);
        }
        expect(cache.totalSize()).toBe(bruteTotal());
        expect(cache.offsetOf(count)).toBe(bruteTotal());
      }
    }
  });

  it("keeps a measurement made before a shrink and restores it after a regrow", () => {
    const cache = new SizeCache(40);
    cache.setCount(10);
    cache.measure(7, 300);
    expect(cache.totalSize()).toBe(9 * 40 + 300);

    cache.setCount(3); // index 7 no longer exists
    expect(cache.totalSize()).toBe(3 * 40);

    cache.setCount(8); // index 7 exists again, with its old measurement
    expect(cache.totalSize()).toBe(7 * 40 + 300);
  });

  it("gives a keyed cache the same offsets as a fresh cache fed the permuted sizes directly", () => {
    const rng = mulberry32(4);
    for (let scenario = 0; scenario < 50; scenario++) {
      const n = randInt(rng, 1, 40);
      const defaultSize = randInt(rng, 1, 50);
      const keys = Array.from({ length: n }, (_, i) => `k${i}`);
      const sizeByKey = new Map<string, number>();
      for (const key of keys) sizeByKey.set(key, randInt(rng, 1, 200));

      const order1 = shuffle(rng, keys);
      const cache = new SizeCache(defaultSize);
      cache.setCount(n);
      cache.setKeyFn((i) => order1[i]);
      for (let i = 0; i < n; i++) {
        cache.measure(i, sizeByKey.get(order1[i])!);
      }

      const order2 = shuffle(rng, keys);
      cache.setKeyFn((i) => order2[i]);

      const fresh = new SizeCache(defaultSize);
      fresh.setCount(n);
      const permutedSizes = order2.map((key) => sizeByKey.get(key)!);
      for (let i = 0; i < n; i++) fresh.measure(i, permutedSizes[i]);

      for (let i = 0; i <= n; i++) {
        expect(cache.offsetOf(i)).toBe(fresh.offsetOf(i));
      }
      expect(cache.totalSize()).toBe(fresh.totalSize());
    }
  });

  it("clears measurements on a keyed to unkeyed mode toggle, returning offsets to multiples of the default size", () => {
    const rng = mulberry32(5);
    for (let scenario = 0; scenario < 30; scenario++) {
      const count = randInt(rng, 1, 40);
      const defaultSize = randInt(rng, 1, 50);
      const cache = new SizeCache(defaultSize);
      cache.setCount(count);

      // Measure a random subset while unkeyed.
      for (let i = 0; i < count; i++) {
        if (rng() < 0.5) cache.measure(i, randInt(rng, 1, 150));
      }

      // Switching to keyed mode drops the unkeyed measurements.
      cache.setKeyFn((i) => `k${i}`);
      expect(cache.totalSize()).toBe(count * defaultSize);

      // Measure a random subset while keyed.
      for (let i = 0; i < count; i++) {
        if (rng() < 0.5) cache.measure(i, randInt(rng, 1, 150));
      }

      // Switching back to unkeyed drops the keyed measurements too.
      cache.setKeyFn(undefined);
      expect(cache.totalSize()).toBe(count * defaultSize);
      for (let i = 0; i < count; i++) {
        expect(cache.offsetOf(i)).toBe(i * defaultSize);
      }
    }
  });

  it("changes only the contribution of unmeasured items when the default size changes", () => {
    const rng = mulberry32(6);
    for (let scenario = 0; scenario < 30; scenario++) {
      const count = randInt(rng, 1, 60);
      const oldDefault = randInt(rng, 1, 50);
      const cache = new SizeCache(oldDefault);
      cache.setCount(count);

      const measured = new Map<number, number>();
      for (let i = 0; i < count; i++) {
        if (rng() < 0.4) {
          const size = randInt(rng, 1, 200);
          measured.set(i, size);
          cache.measure(i, size);
        }
      }

      const newDefault = randInt(rng, 1, 50);
      cache.setDefaultSize(newDefault);

      const expectedSizes = Array.from(
        { length: count },
        (_, i) => measured.get(i) ?? newDefault
      );
      const expectedOffsets = bruteOffsets(expectedSizes);
      for (let i = 0; i <= count; i++) {
        expect(cache.offsetOf(i)).toBe(expectedOffsets[i]);
      }
    }
  });

  it("returns true from measure only when the value actually changes", () => {
    const cache = new SizeCache(40);
    cache.setCount(5);
    expect(cache.measure(2, 100)).toBe(true);
    expect(cache.measure(2, 100)).toBe(false);
    expect(cache.measure(2, 101)).toBe(true);
    expect(cache.measure(2, 101)).toBe(false);
  });

  it("returns false from measureKey for an index outside the current count and stores nothing", () => {
    const cache = new SizeCache(40);
    cache.setCount(3);

    expect(cache.measureKey("ghost", -1, 999)).toBe(false);
    expect(cache.measureKey("ghost", 5, 999)).toBe(false);

    // Nothing was stored under "ghost": once an index maps onto that key,
    // its size is still the default rather than the rejected value.
    cache.setKeyFn((i) => (i === 0 ? "ghost" : `other${i}`));
    expect(cache.sizeOf(0)).toBe(40);

    // Growing the count to include index 5 does not surface the rejected
    // measurement either.
    cache.setCount(6);
    cache.setKeyFn((i) => (i === 5 ? "ghost" : `other${i}`));
    expect(cache.sizeOf(5)).toBe(40);
  });
});
