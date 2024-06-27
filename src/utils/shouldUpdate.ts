export default (
  prev: any[],
  next: any[],
  skip: Record<string, boolean>
): boolean => {
  if (prev.length !== next.length) return true;

  for (let i = 0; i < prev.length; i += 1) {
    const prevItem: any = prev[i];
    const nextItem: any = next[i];

    for (const key in prevItem) {
      if (!skip[key] && prevItem[key] !== nextItem[key]) {
        return true;
      }
    }
  }

  return false;
};
