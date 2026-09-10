/** Identity of an item, used as the key its measured size is stored under. */
export type ItemKey = string | number;

/**
 * Prefix-sum cache of item offsets for the virtualizer.
 *
 * Offsets are rebuilt lazily from the first dirty index, so repeated queries
 * between changes are O(1) for offsets and O(log n) for hit testing, while a
 * measurement update costs one suffix rebuild on the next query.
 *
 * Measured sizes persist even after an item unmounts, so scrolling back to a
 * previously measured region never causes layout jumps.
 *
 * Sizes are stored per key rather than per index. Without a key function the
 * key is the index itself; with one, a reorder of the data moves each measured
 * size along with its item. The cost is that a change of key function identity
 * dirties everything: one O(count) offset rebuild on the next query. Memoize
 * the key function on the data it closes over.
 */
export class SizeCache {
  private offsets: number[] = [0];
  private measured = new Map<ItemKey, number>();
  private dirtyFrom = 0;
  private count = 0;
  private defaultSize: number;
  private keyFn: ((index: number) => ItemKey) | undefined;

  constructor(defaultSize: number) {
    this.defaultSize = defaultSize;
  }

  setDefaultSize(size: number): void {
    if (size === this.defaultSize) return;
    this.defaultSize = size;
    this.dirtyFrom = 0;
  }

  setCount(count: number): void {
    if (count === this.count) return;
    this.dirtyFrom = Math.min(this.dirtyFrom, this.count, count);
    this.count = count;
  }

  /**
   * Install the key function. Any change of identity means the index to key
   * mapping may have moved, so every offset is rebuilt on the next query.
   * Switching the mode (keyed to unkeyed or back) also drops the measurements:
   * numeric item keys and index keys share one map and must never collide.
   */
  setKeyFn(fn: ((index: number) => ItemKey) | undefined): void {
    if (fn === this.keyFn) return;
    const modeChanged = (fn === undefined) !== (this.keyFn === undefined);
    this.keyFn = fn;
    if (modeChanged) this.measured.clear();
    this.dirtyFrom = 0;
  }

  keyOf(index: number): ItemKey {
    return this.keyFn ? this.keyFn(index) : index;
  }

  /** Record a measured size for an index. Returns true when the value changed. */
  measure(index: number, size: number): boolean {
    if (index < 0 || index >= this.count) return false;
    return this.measureKey(this.keyOf(index), index, size);
  }

  /**
   * Record a measured size under a key captured earlier, for measurements that
   * are delivered after the data may have moved. The index only says where the
   * offsets have to be rebuilt from.
   */
  measureKey(key: ItemKey, index: number, size: number): boolean {
    if (index < 0 || index >= this.count) return false;
    if (this.measured.get(key) === size) return false;
    this.measured.set(key, size);
    this.dirtyFrom = Math.min(this.dirtyFrom, index);
    return true;
  }

  sizeOf(index: number): number {
    return this.measured.get(this.keyOf(index)) ?? this.defaultSize;
  }

  /** Pixel offset of the top of the item. offsetOf(count) is the total size. */
  offsetOf(index: number): number {
    this.ensure();
    const clamped = Math.max(0, Math.min(index, this.count));
    return this.offsets[clamped];
  }

  totalSize(): number {
    this.ensure();
    return this.offsets[this.count];
  }

  /** Index of the item whose span contains the given pixel offset. */
  indexAt(offset: number): number {
    if (this.count === 0) return 0;
    this.ensure();
    if (offset <= 0) return 0;
    let lo = 0;
    let hi = this.count - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (this.offsets[mid] <= offset) {
        lo = mid;
      } else {
        hi = mid - 1;
      }
    }
    return lo;
  }

  private ensure(): void {
    const n = this.count;
    if (this.dirtyFrom > n) this.dirtyFrom = n;
    if (this.offsets.length !== n + 1) {
      this.offsets.length = n + 1;
      this.offsets[0] = 0;
    }
    for (let i = this.dirtyFrom; i < n; i++) {
      this.offsets[i + 1] = this.offsets[i] + this.sizeOf(i);
    }
    this.dirtyFrom = n;
  }
}
