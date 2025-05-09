import { JSX } from "react";

export interface VirtualRenderWaveHandle {
  scrollTo: (index: number) => void;
  scrollToOffset: (px: number) => void;
  getVisibleIndexes: () => number[];
}

export interface WrapperProps {
  ref: React.RefObject<HTMLElement | null>;
  style: React.CSSProperties;
  className?: string;
  children: React.ReactNode;
}

export type HTMLTag = keyof JSX.IntrinsicElements & keyof HTMLElementTagNameMap;

export type GetItemType<T> = T extends (infer U)[] ? U : never;
export interface VirtualRenderWaveProps<T = any> {
  items: T[];
  itemHeight: number;
  containerHeight?: number;
  batchSize?: number;
  interval?: number;
  overscan?: number;
  startIndex?: number;
  className?: string;
  style?: React.CSSProperties;
  renderItem: (item: T, index: number) => React.ReactNode;
  renderSkeleton?: (index: number) => React.ReactNode;
  scrollToIndex?: number;
  outerElement?: HTMLTag | React.FC<WrapperProps>;
  innerElement?: HTMLTag | React.FC<WrapperProps>;
  transition?: boolean;
  snapToBatch?: boolean;
  onEndReached?: () => void;
  keyboardNavigation?: boolean;
  renderStickyHeader?: (group: string) => React.ReactNode;
  groupByKey?: keyof GetItemType<T> | ((item: GetItemType<T>) => string);
}
