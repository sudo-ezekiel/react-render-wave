![ShowCase](https://sudo-ezekiel.github.io/images/RenderWave/showcase.png)

# 🌊 React Render Wave

[![npm version](https://img.shields.io/npm/v/react-render-wave)](https://www.npmjs.com/package/react-render-wave)
[![license](https://img.shields.io/npm/l/react-render-wave)](./LICENSE)

**Progressive wave rendering and lightweight virtual scrolling for React lists.**

Mounting thousands of components in one commit janks the main thread. React Render Wave splits the work into small timed batches ("waves"), so the first paint is instant and the rest of the list streams in while the UI stays responsive. For very large lists, `VirtualRenderWave` adds windowing on top: only the rows in view (plus overscan) exist in the DOM.

Zero dependencies, ~3.6 kB gzipped, ships ESM and CJS with TypeScript types.

## ✨ Features

- 🌊 Progressive wave-based rendering with `batchSize` and `interval`
- 🧠 Virtual scrolling with overscan, driven by a prefix-sum offset cache with binary search
- 📏 Dynamic row heights, measured automatically with `ResizeObserver`
- 🦴 Skeleton placeholders for rows the wave has not reached yet
- 🧲 Snap-to-batch scroll alignment
- ⌨️ Keyboard navigation (arrows, PageUp/PageDown, Home, End)
- 📌 Sticky group headers
- 🔄 Infinite loading via `onEndReached`
- ♿ List semantics with `aria-setsize` and `aria-posinset`
- ⚛️ TypeScript-first, React 18 and 19, SSR-friendly

## 📦 Installation

```bash
npm install react-render-wave
```

## 🧪 Quick start

```jsx
import { RenderWave } from "react-render-wave";

const items = Array.from({ length: 1000 }, (_, i) => `Item ${i}`);

<RenderWave
  items={items}
  batchSize={20}
  interval={50}
  renderItem={(item, index) => <div key={index}>{item}</div>}
/>;
```

The first batch renders immediately; every following batch is committed on an animation frame after `interval` milliseconds. In a hidden tab the reveal pauses and resumes with visibility, like any frame-based work.

### `<RenderWave>` props

| Prop         | Type                                    | Default | Description                                        |
| ------------ | --------------------------------------- | ------- | -------------------------------------------------- |
| `items`      | `T[]`                                   | required | The full list.                                    |
| `renderItem` | `(item: T, index: number) => ReactNode` | required | Render one item. Set a `key` on the root element. |
| `batchSize`  | `number`                                | `20`    | Items revealed per wave.                           |
| `interval`   | `number`                                | `50`    | Milliseconds between waves.                        |
| `startIndex` | `number`                                | `0`     | First index to reveal.                             |
| `enabled`    | `boolean`                               | `true`  | Set `false` to pause the reveal.                   |
| `onComplete` | `() => void`                            |         | Fires once when the whole list is revealed.        |

## 🪝 The hook: `useRenderWave`

Use the hook directly when you want to drive your own markup:

```tsx
import { useRenderWave } from "react-render-wave";

function Grid({ rows }: { rows: Row[] }) {
  const { count, isComplete, reset } = useRenderWave({
    length: rows.length,
    batchSize: 16,
    interval: 30,
  });

  return (
    <>
      {!isComplete && <Spinner />}
      <button onClick={reset}>Replay</button>
      {rows.slice(0, count).map((row) => (
        <Cell key={row.id} row={row} />
      ))}
    </>
  );
}
```

It returns `{ count, indexes, isComplete, reset }`:

- `count`: how many items are revealed so far (counting from `startIndex`).
- `indexes`: the revealed indexes as an array. Referentially stable between waves, safe to memo against.
- `isComplete`: `true` once everything is revealed.
- `reset()`: restart from the first batch.

The hook clamps correctly when `items` shrinks, resumes when it grows, and never yields indexes past the end of the list, so `items[i]` is always defined.

## 🔁 Virtual scrolling: `<VirtualRenderWave>`

```tsx
import { VirtualRenderWave } from "react-render-wave";

<VirtualRenderWave
  items={items}
  itemHeight={40}
  containerHeight={400}
  overscan={5}
  keyboardNavigation
  renderItem={(item, index) => <div>{item}</div>}
  renderSkeleton={(index) => <div className="skeleton" />}
/>;
```

Only the visible window plus `overscan` rows are mounted. Offsets come from a prefix-sum cache with binary search, so scroll math stays fast at 100k+ rows.

### Choosing batchSize on a long list

The wave counts from `startIndex` regardless of where the user has scrolled, so a row is revealed only once the wave reaches its index. On a long list with a small `batchSize`, scrolling faster than the wave lands you on rows that are windowed in but not yet revealed: they render your skeleton, or nothing at all if you have not supplied one.

Windowing already caps how many rows mount at once, so the wave buys you little on a virtualized list beyond the initial fill. Pick one:

- **Long lists**: set `batchSize={items.length}` to reveal in one wave and let windowing do the work.
- **Slow waves on purpose**: keep the list short enough that the wave finishes quickly, and always pass `renderSkeleton` so rows ahead of the wave still have something to show.

`RenderWave` has no such tension, because nothing is windowed away.

### Props

| Prop                  | Type                                          | Default  | Description                                                                 |
| --------------------- | --------------------------------------------- | -------- | --------------------------------------------------------------------------- |
| `items`               | `T[]`                                         | required | The full list.                                                              |
| `itemHeight`          | `number`                                      | required | Row height in px. With dynamic content it is the estimate before measuring. |
| `renderItem`          | `(item: T, index: number) => ReactNode`       | required | Render one row.                                                             |
| `containerHeight`     | `number`                                      | `400`    | Container height in px. Or size it via `style` (see below).                 |
| `batchSize`           | `number`                                      | `20`     | Items revealed per wave.                                                    |
| `interval`            | `number`                                      | `50`     | Milliseconds between waves.                                                 |
| `overscan`            | `number`                                      | `5`      | Extra rows rendered above and below the viewport.                           |
| `startIndex`          | `number`                                      | `0`      | First index to reveal.                                                      |
| `renderSkeleton`      | `(index: number) => ReactNode`                |          | Placeholder for rows the wave has not reached.                              |
| `getItemKey`          | `(item: T, index: number) => string \| number` | index    | Stable row keys for dynamic data.                                           |
| `scrollToIndex`       | `number`                                      |          | Scrolls whenever the value changes.                                         |
| `transition`          | `boolean`                                     | `false`  | Fade newly revealed rows in.                                                |
| `snapToBatch`         | `boolean`                                     | `false`  | Align scroll to the nearest batch after scrolling stops (fixed heights).    |
| `onEndReached`        | `() => void`                                  |          | Fires once per arrival at the end. Pair with appending items.               |
| `endReachedThreshold` | `number`                                      | `10`     | Distance in px from the bottom that counts as the end.                      |
| `onScroll`            | `(scrollTop: number) => void`                 |          | Scroll position, at most once per frame.                                    |
| `keyboardNavigation`  | `boolean`                                     | `false`  | Focusable container with arrow/page/Home/End scrolling.                     |
| `groupByKey`          | `keyof T \| (item, index) => string`          |          | Group label per row, for sticky headers.                                    |
| `renderStickyHeader`  | `(group: string) => ReactNode`                |          | Sticky header for the topmost visible group.                                |
| `outerElement`        | `HTMLTag \| FC<WrapperProps>`                 | `"div"`  | Custom scroll container.                                                    |
| `innerElement`        | `HTMLTag \| FC<WrapperProps>`                 | `"div"`  | Custom content sizer.                                                       |
| `className` / `style` | `string` / `CSSProperties`                    |          | Applied to the scroll container.                                            |
| `ariaLabel`           | `string`                                      |          | Accessible label for the scroll container.                                  |

### Imperative handle

```tsx
const ref = useRef<VirtualRenderWaveHandle>(null);

<VirtualRenderWave ref={ref} ... />

ref.current?.scrollTo(500);            // align row 500 to the top (smooth)
ref.current?.scrollTo(500, "auto");    // or instant
ref.current?.scrollToOffset(1200);
ref.current?.getVisibleIndexes();      // rendered and revealed indexes
ref.current?.getScrollElement();       // the scrollable element
```

### Dynamic row heights

Rows are measured with a `ResizeObserver` as they mount, and measurements persist after rows unmount, so scrolling back never jumps. `itemHeight` is used as the estimate for rows that have not been measured yet. Nothing to configure:

```tsx
<VirtualRenderWave
  items={posts}
  itemHeight={80} // estimate
  renderItem={(post) => <ArticleCard post={post} />}
/>
```

### Filling the parent instead of a fixed height

Pass a height through `style`; the viewport is measured with a `ResizeObserver` either way:

```tsx
<VirtualRenderWave items={items} itemHeight={40} style={{ height: "100%" }} ... />
```

### Sticky group headers

`groupByKey` derives a label per row, and `renderStickyHeader` renders the label for the topmost visible row. The library only handles positioning, so give your header a background; otherwise rows scroll visibly behind it.

```tsx
<VirtualRenderWave
  items={contacts}
  itemHeight={48}
  groupByKey="letter"
  renderStickyHeader={(letter) => (
    <div className="bg-white border-b px-3 py-2 font-semibold">{letter}</div>
  )}
  renderItem={(contact) => <Contact data={contact} />}
/>
```

### Infinite loading

`onEndReached` fires once each time the user arrives at the end, so a plain append is safe:

```tsx
<VirtualRenderWave
  items={rows}
  itemHeight={56}
  onEndReached={() => setRows((prev) => [...prev, ...fetchNextPage()])}
  ...
/>
```

## 🖥️ SSR

The first batch is part of the initial render, so server markup and hydration are deterministic. Timers, observers, and measurements start on the client.

## 📘 Demo

```bash
git clone https://github.com/sudo-ezekiel/react-render-wave
cd react-render-wave
npm install
npm run demo
```

The demo shows 10,000 rows with windowing, dynamic heights, sticky headers, keyboard navigation, snap-to-batch, and infinite loading.

## 🚀 Migrating from v2

v3 is a ground-up rewrite of the internals with a close-to-compatible component API.

**WASM was removed.** v2 routed a handful of small computations (an array filter and some arithmetic) through Rust/WebAssembly. Crossing the JS/WASM boundary costs more than those computations themselves, and shipping the `.wasm` file forced consumers to configure wasm-aware bundlers. v3 does the same work in plain TypeScript with better algorithms, renders identically, and drops the bundler requirements along with most of the package size.

Breaking changes:

- `useRenderWave` returns an object instead of an index array. Change `const indexes = useRenderWave(...)` to `const { indexes } = useRenderWave(...)`.
- Removed exports: `useVirtualScrollCore`, `initWasm`, `getVisibleIndexesSafe`, `snapToOffsetSafe`, `computeScrollTargetSafe`.
- `VirtualRenderWave`'s default `interval` is now 50 ms (was 60) to match the hook.
- `onEndReached` fires once per arrival at the end instead of on every scroll frame. Remove any debouncing you added around it.
- Keyboard navigation listens on the container instead of `window` and prevents default for handled keys. The list needs focus (it sets `tabIndex={0}`), which matches how native list widgets behave.
- `scrollToIndex` scrolls as soon as the value changes instead of waiting for the reveal, and re-scrolls only when the value changes.
- Skeletons are now visible while `transition` is enabled (v2 rendered them at opacity 0).
- `role="list"` moved from the scroll container to the inner element, and rows expose `aria-setsize` and `aria-posinset`, so list semantics are valid.
- Custom `outerElement` components receive `tabIndex`, `onKeyDown`, `role`, and `aria-label` in `WrapperProps`. Spread the whole props object onto your DOM node.
- The sticky header wrapper no longer applies a white background and bottom border. Style your own header so it works with your theme.

New in v3:

- `getItemKey`, `onScroll`, `endReachedThreshold`, `ariaLabel` props.
- `enabled` and `onComplete` on the hook and `RenderWave`; `reset`, `count`, `isComplete` in the hook result.
- `getScrollElement()` on the handle, and a `behavior` parameter for `scrollTo` / `scrollToOffset`.
- All public types are exported: `VirtualRenderWaveHandle`, `VirtualRenderWaveProps`, `WrapperProps`, and friends.
- CJS build next to ESM, a proper `exports` map with a `types` condition, and `sideEffects: false`.
- A test suite (vitest + Testing Library) covering the reveal, windowing, measurement, and interaction paths.

## 🧩 Roadmap

- 🔲 Horizontal virtualization
- 🔲 Table layout with expandable rows
- 🔲 Docs site with recipes and real-world examples

## 🌍 Contributing

Contributions are welcome. Useful commands:

```bash
npm install
npm test          # vitest
npm run demo      # local playground
npm run build     # dist (ESM + CJS + types)
npm run typecheck
```

## 🙏 Acknowledgements

Special thanks to [@sequencemedia](https://github.com/sequencemedia) for helping squash a tricky bug and making React Render Wave better. 👷‍♂️👏

## License

[MIT](./LICENSE)
