/**
 * Prefix-sum cache of item offsets for the virtualizer.
 *
 * Offsets are rebuilt lazily from the first dirty index, so repeated queries
 * between changes are O(1) for offsets and O(log n) for hit testing, while a
 * measurement update costs one suffix rebuild on the next query.
 *
 * Measured heights persist even after an item unmounts, so scrolling back to
 * a previously measured region never causes layout jumps.
 */
export class HeightCache {
  private offsets: number[] = [0];
  private measured = new Map<number, number>();
  private dirtyFrom = 0;
  private count = 0;
  private defaultSize: number;

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

  /** Record a measured height. Returns true when the value changed. */
  measure(index: number, size: number): boolean {
    if (index < 0 || index >= this.count) return false;
    if (this.measured.get(index) === size) return false;
    this.measured.set(index, size);
    this.dirtyFrom = Math.min(this.dirtyFrom, index);
    return true;
  }

  sizeOf(index: number): number {
    return this.measured.get(index) ?? this.defaultSize;
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
