export default (
  low: number,
  high: number,
  input: number,
  getVal: (idx: number) => number
): number => {
  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    const val = getVal(mid);

    if (input < val) {
      high = mid - 1;
    } else if (input > val) {
      low = mid + 1;
    } else {
      return mid;
    }
  }

  // Return the nearest index where the input could be inserted
  return Math.max(low - 1, 0);
};
