# Changelog

## 3.1.0 (2026-09-10)

The windowing engine is now a public hook, `useVirtualWindow`, and `VirtualRenderWave` is built on it. The component API grows by four props and one option object; the one type change that can break a compile is listed under Changed.

### Added

- `useVirtualWindow`, a headless windowing hook: given a count and an estimated size it returns the items to render with their offsets, a ref for the scroll container, a per-item ref that measures rows and corrects the offsets below them, `totalSize` for the sizer, and `scrollToIndex`/`scrollToOffset`. It renders nothing and owns no styles, so it fits a table, a grid or a scroller you already have. Options include `scrollMargin` for an in-flow header above the sizer and `measureSize` for fractional row heights. The first render depends only on the count, the estimate, overscan, `scrollMargin`, `getItemKey` and the `initial*` options, so server markup and the first client render agree.
- Exported types for the hook: `UseVirtualWindowOptions`, `UseVirtualWindowResult`, `VirtualItem`, `VirtualRange`, `ScrollAlign`, `ScrollToIndexOptions`, `ScrollToOffsetOptions`, `ItemKey`; and for the component: `RevealMode`, `WrapperComponent`.
- `VirtualRenderWave`: `revealMode`. `"sequential"` (the default) is the 3.0 behaviour and counts forward from `startIndex` regardless of scroll position. `"viewport"` reveals the rows inside the rendered window in batches and never re-hides a revealed row, so a small `batchSize` still fills the screen on a long list instead of needing `batchSize={items.length}`.
- `VirtualRenderWave`: `initialScrollOffset` and `initialScrollIndex`, both read once. The first paint and the server markup already show that window rather than jumping to it after mount. `initialScrollIndex` wins over `initialScrollOffset`, and over a controlled `scrollToIndex` at mount, and is corrected once the rows above it are measured.
- `VirtualRenderWave`: `onRangeChange`, called after commit whenever the rendered or visible range changes. The payload is a `VirtualRange`; `end` and `visibleEnd` are exclusive.
- Handle: `scrollTo(index, options)` accepts `{ align, behavior }` as well as the old behavior string. `align` is `"start"` (default), `"center"`, `"end"` or `"auto"`, which only scrolls when the item is not already fully visible.
- A GitHub Actions workflow (CI) that runs typecheck, tests, build and the package checks on Node 20 and 22, plus a job that reinstalls React 18 and runs typecheck and tests against it, since the devDependencies pin React 19.
- `npm run check:pkg`, which runs publint and arethetypeswrong against the packed tarball. `prepublishOnly` runs it.
- Test suite: 179 tests across 18 files, including regression tests for every fix below.

### Fixed

- React 18: a custom `outerElement` or `innerElement` written as a `forwardRef` component could not attach its ref, so the list could not scroll or measure. Rendering and types now support it, and a dev-only `console.error` names the wrapper when one swallows the ref instead of failing silently.
- Package types did not resolve under Node16/NodeNext module resolution from either CJS or ESM. The `exports` map now carries a `types` entry per condition and the build emits both `.d.ts` and `.d.cts`; publint and arethetypeswrong are clean across all four resolution modes.
- `onEndReached` never fired when the content was shorter than the viewport, so a short first page could not trigger the next one. It now runs after any commit that changes the geometry.
- `scrollTo`/`scrollToIndex` near the end of a list whose rows measure taller than the estimate stopped short of the target and never re-aimed. Programmatic scrolls now stay on target while the rows they mount are measured.
- With a non-zero `scrollMargin`, the first render and the server markup opened at the wrong window when `initialScrollIndex` was set.
- `align: "auto"` on an item taller than the viewport could never treat it as already visible, so repeated calls oscillated between two positions.
- `scrollToIndex(NaN)` and `scrollToOffset(NaN)` reset the scroll position to the top instead of being ignored. A non-finite `initialScrollOffset` did the same on the first render.
- Degenerate options broke windowing entirely: an `itemHeight`/`estimateSize` of 0, NaN or Infinity mounted every row in the list, and a negative or NaN `overscan` rendered nothing. The estimate now falls back to 1 and overscan is clamped to a non-negative whole number.
- With `keyboardNavigation`, the arrows, Home, End and the page keys were taken from any focused control inside a row (an input, a select, a contentEditable region). They now only scroll the list when the keydown starts on the scroll container itself.
- The fade-in for revealed rows ignored `prefers-reduced-motion`. The injected keyframes are scoped to `prefers-reduced-motion: no-preference`, so a preference flipped at runtime is picked up without a listener.
- The dev-only warning about a ref-swallowing wrapper fired twice under StrictMode.
- The height cache was replaced by a keyed size cache, so a measured row keeps its height across a reorder when `getItemKey` is set.

### Changed

- `WrapperProps.ref` is optional and typed `RefObject<any>` (it was a required `RefObject<HTMLElement | null>`), and `WrapperComponent` may return `ReactNode | Promise<ReactNode>`. This is the one source-breaking type change in the release: code that read `props.ref.current` needs `props.ref?.current`. It is also what makes a custom wrapper compile at all in most shapes. Before, only a `forwardRef` component typed for `HTMLElement` passed `tsc`; a `forwardRef` typed for `HTMLDivElement`, a plain `FC<WrapperProps>` attaching the ref itself, an `FC` reading `props.ref?.current`, and under `@types/react` 19 anything typed `FC<WrapperProps>` were all rejected. All five compile now.
- Handle: `scrollTo` takes `(index, options?)` where `options` is a `ScrollBehavior` string or `{ align, behavior }`. The string form still works. `behavior` still defaults to `"smooth"` on the handle.
- `getItemKey` returns the named type `ItemKey` (`string | number`). No behaviour change.
- `outerElement` and `innerElement` accept `WrapperComponent`. On React 19 the ref arrives as a prop; on React 18 the component must be wrapped in `forwardRef` and attach the forwarded ref.
- `engines.node` is `>=18`.
- Bundle size: the ESM build gzips to about 7 kB (3.0.0: about 3.7 kB). The growth is the windowing hook.

## 3.0.0 (2026-08-22)

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
