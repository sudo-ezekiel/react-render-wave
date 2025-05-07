import initWasmModule from "../pkg/react_render_wave_wasm_bg.wasm?init";
import * as wasm from "../pkg/react_render_wave_wasm.js";

let initialized = false;
let wasmAvailable = false;

export async function initWasm() {
  if (!initialized) {
    try {
      await (wasm as any).default(initWasmModule);
      initialized = true;
      wasmAvailable = true;
    } catch (err) {
      console.warn("WASM init failed, falling back to JS:", err);
      wasmAvailable = false;
    }
  }
}

export function getVisibleIndexesSafe(
  start: number,
  end: number,
  revealed: number[]
): number[] {
  if (wasmAvailable) {
    try {
      const typedArray = new Uint32Array(revealed);
      const result = wasm.get_visible_indexes(start, end, typedArray);
      return Array.from(result);
    } catch (err) {
      console.warn("WASM execution failed, fallback to JS:", err);
    }
  }
  return revealed.filter((i) => i >= start && i < end);
}

export function snapToOffsetSafe(
  scrollTop: number,
  itemHeight: number,
  batchSize: number
): number {
  if (wasmAvailable) {
    try {
      return wasm.snap_to_batch_offset(scrollTop, itemHeight, batchSize);
    } catch (err) {
      console.warn("WASM snap failed, using JS fallback");
    }
  }

  const batchPixelSize = itemHeight * batchSize;
  const targetIndex = Math.round(scrollTop / batchPixelSize) * batchSize;
  return targetIndex * itemHeight;
}

export function computeScrollTargetSafe(
  key: string,
  scrollTop: number,
  containerHeight: number,
  itemHeight: number,
  maxScroll: number
): number {
  if (wasmAvailable) {
    try {
      return wasm.compute_scroll_target(
        key,
        scrollTop,
        containerHeight,
        itemHeight,
        maxScroll
      );
    } catch (err) {
      console.warn("WASM scrollTarget failed, fallback to JS");
    }
  }

  switch (key) {
    case "PageDown":
      return Math.min(scrollTop + containerHeight, maxScroll);
    case "PageUp":
      return Math.max(scrollTop - containerHeight, 0);
    case "ArrowDown":
      return Math.min(scrollTop + itemHeight, maxScroll);
    case "ArrowUp":
      return Math.max(scrollTop - itemHeight, 0);
    case "Home":
      return 0;
    case "End":
      return maxScroll;
    default:
      return scrollTop;
  }
}
