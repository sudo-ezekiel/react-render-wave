# Changelog

## 3.0.0 (2026-07-28)

Ground-up rewrite of the internals. The component API stays close to v2; the sections below are the full list of what changed.

### Removed

- The Rust/WebAssembly layer. The functions it implemented (an index filter, batch snapping, scroll-target math) are cheaper in plain JavaScript than the cost of crossing the JS/WASM boundary, and the `.wasm` asset forced consumers to configure wasm-aware bundlers. Removing it also removes `vite-plugin-wasm`, `wasm-pack`, and the Windows-only `xcopy` build step.
- Public exports `useVirtualScrollCore`, `initWasm`, `getVisibleIndexesSafe`, `snapToOffsetSafe`, `computeScrollTargetSafe`.
- The Storybook setup, which referenced packages that were no longer in `devDependencies`. A small Vite playground (`npm run demo`) replaces it.

### Fixed

- First render no longer produces out-of-range indexes when `items.length < batchSize` (v2 called `renderItem(undefined, i)` on the first paint).
- Reveal timers are no longer scheduled inside a `setState` updater, which could double-schedule under StrictMode.
- Windowing math went from O(n) scans per render (and an O(n squared) reveal check) to a prefix-sum offset cache with binary search.
- Dynamic heights: rows are measured with a `ResizeObserver` whenever they resize. v2 only measured on `items` changes, dropped measurements for unmounted rows, and leaked item refs.
- Skeletons are visible while `transition` is enabled (v2 rendered them at opacity 0).
- `onEndReached` fires once per arrival at the end instead of on every scroll frame at the bottom.
- Keyboard navigation prevents default for handled keys, so arrows no longer scroll twice; the listener moved from `window` to the container.
- `scrollToIndex` no longer re-scrolls on every reveal tick; it scrolls once per value change.
- The fade-in keyframes are injected once per document instead of one `<style>` tag per component instance.
- Valid list semantics: `role="list"` on the inner element, `aria-setsize` and `aria-posinset` on rows.

### Changed

- `useRenderWave` returns `{ count, indexes, isComplete, reset }` instead of a number array.
- The sticky header wrapper handles positioning only. It no longer forces a white background and bottom border, which broke dark themes; style your own header instead.
- `VirtualRenderWave`'s default `interval` is 50 ms, matching the hook.
- Packaging: dual ESM/CJS output, `exports` map with a `types` condition, `sideEffects: false`, cross-platform npm scripts, `repository`/`homepage`/`bugs` metadata, and a LICENSE file.

### Added

- Hook and `RenderWave`: `enabled`, `onComplete`; hook result: `count`, `isComplete`, `reset`.
- `VirtualRenderWave`: `getItemKey`, `onScroll`, `endReachedThreshold`, `ariaLabel`.
- Handle: `getScrollElement()`, plus a `behavior` parameter for `scrollTo` and `scrollToOffset`.
- All public types exported from the package root.
- Test suite (vitest + Testing Library): 42 tests over the cache, the hook, and both components.

## 2.0.11

Last v2 release. Progressive rendering plus virtual scroll with experimental WASM acceleration.
