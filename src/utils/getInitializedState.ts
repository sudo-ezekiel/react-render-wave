export type ItemSize = number | ((index: number, width: number) => number);

export type preRenderedItemCount = number | [number, number];

import isNumber from "./isNumber";

const getInitState = (
  itemSize: ItemSize,
  preRenderedItemCount: preRenderedItemCount = 0
) => {
  const isCountNumber = isNumber(preRenderedItemCount);
  const [idx, len] = isCountNumber
    ? [0, (preRenderedItemCount as number) - 1]
    : (preRenderedItemCount as [number, number]);
  const isItemSizeNumber = isNumber(itemSize);

  const items = Array.from({ length: len - idx + 1 }, (_, i) => {
    const index = idx + i;
    return {
      index,
      start: 0,
      width: 0,
      size: isItemSizeNumber
        ? (itemSize as number)
        : (itemSize as (index: number, width: number) => number)(index, 0),
      measureRef: (ref: Element | null) => null,
    };
  });

  return { items };
};

export default getInitState;
