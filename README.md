![React Render Wave](https://raw.githubusercontent.com/sudo-ezekiel/react-render-wave/main/assets/showcase.png)

# React Render Wave

[![npm version](https://img.shields.io/npm/v/react-render-wave)](https://www.npmjs.com/package/react-render-wave)
[![license](https://img.shields.io/npm/l/react-render-wave)](https://github.com/sudo-ezekiel/react-render-wave/blob/main/LICENSE)

Progressive wave rendering and lightweight virtual scrolling for React lists.

Mounting thousands of components in one commit blocks the main thread. This
library splits that work into small timed batches, so the first paint happens
immediately and the rest streams in while the page stays responsive. For long
lists, `VirtualRenderWave` adds windowing on top: only the rows in view, plus
overscan, exist in the DOM.

No dependencies, about 3.7 kB gzipped, ESM and CJS with TypeScript types.

**Docs, recipes and runnable examples: [renderwave.sudo-ezekiel.com](https://renderwave.sudo-ezekiel.com)**

## Install

```bash
npm install react-render-wave
```

React 18 or 19 is a peer dependency.

## What you get

Three exports, in increasing order of how much they do for you.

`useRenderWave` is the reveal on its own. It tells you how many items to show
right now and nothing else, so you keep full control of the markup.

`RenderWave` wraps the hook in a component. Everything mounts eventually,
nothing is windowed away. Reach for it when the cost is the components
themselves rather than the number of rows: a grid of charts, a page of cards
that each do layout work.

`VirtualRenderWave` adds windowing. Row offsets come from a prefix-sum cache
with binary search, so the scroll math holds up past 100,000 rows. Heights can
be uniform or measured per row. This is the one you want for a long list.

Beyond that: dynamic row heights measured with a ResizeObserver and cached
across unmounts, skeleton placeholders, sticky group headers, keyboard
navigation, infinite loading, snap-to-batch alignment, and list semantics with
`role="list"`, `aria-setsize` and `aria-posinset`. React 18 and 19, SSR safe:
the first batch renders synchronously, so server markup is deterministic.

## Quick start

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

The first batch renders immediately, so there is no empty flash. Every batch
after it is committed on an animation frame once `interval` has elapsed.
Browsers stop serving frames to a hidden tab, so the reveal parks itself in
the background and picks up when the tab comes forward.

For a long list, reach for windowing instead:

```tsx
import { VirtualRenderWave } from "react-render-wave";

<VirtualRenderWave
  items={items}
  itemHeight={40}
  containerHeight={400}
  batchSize={items.length}
  getItemKey={(item) => item.id}
  renderItem={(item) => <Row item={item} />}
/>;
```

Two things in there are worth knowing about before you ship, and both have a
page on the docs site: [why `batchSize` is the full
length](https://renderwave.sudo-ezekiel.com/recipes/batch-size/) on a
virtualized list, and [why `getItemKey` matters](https://renderwave.sudo-ezekiel.com/recipes/stable-keys/)
as soon as the list can sort or filter.

## The hook

```tsx
import { useRenderWave } from "react-render-wave";

function Grid({ rows }: { rows: Row[] }) {
  const { indexes, isComplete, reset } = useRenderWave({
    length: rows.length,
    batchSize: 16,
    interval: 30,
  });

  return (
    <>
      {!isComplete && <Spinner />}
      <button onClick={reset}>Replay</button>
      {indexes.map((i) => (
        <Cell key={rows[i].id} row={rows[i]} />
      ))}
    </>
  );
}
```

It returns `count`, `indexes`, `isComplete` and `reset`. The hook clamps when
`items` shrinks, resumes when it grows, and never yields an index past the end
of the list, so `items[i]` is always defined.

## API

### `useRenderWave(options)`

| Option | Default | Description |
| --- | --- | --- |
| `length` | required | Total number of items available. |
| `batchSize` | `20` | Items revealed per wave. |
| `interval` | `50` | Delay in milliseconds between waves. |
| `startIndex` | `0` | Index of the first item to reveal. |
| `enabled` | `true` | Set to `false` to pause the reveal. The first batch stays visible. |
| `onComplete` | – | Called once each time the reveal reaches the end. |

Returns `{ count, indexes, isComplete, reset }`.

### `<RenderWave>`

| Prop | Default | Description |
| --- | --- | --- |
| `items` | required | The list to render. |
| `renderItem` | required | `(item, index) => ReactNode`. Set a key on the returned element. |
| `batchSize` | `20` | Items revealed per wave. |
| `interval` | `50` | Delay in milliseconds between waves. |
| `startIndex` | `0` | Index of the first item to reveal. |
| `enabled` | `true` | Set to `false` to pause the reveal. |
| `onComplete` | – | Called once each time the reveal reaches the end. |

### `<VirtualRenderWave>`

| Prop | Default | Description |
| --- | --- | --- |
| `items` | required | The list to render. |
| `itemHeight` | required | Row height in pixels. With dynamic content this is the estimate used until a row is measured. |
| `renderItem` | required | `(item, index) => ReactNode`. |
| `containerHeight` | `400` | Viewport height in pixels. Pass a height in `style` instead (for example `"100%"`) to size from the parent; the viewport is measured with a ResizeObserver either way. |
| `batchSize` | `20` | Items revealed per wave. |
| `interval` | `50` | Delay in milliseconds between waves. |
| `overscan` | `5` | Extra rows rendered above and below the viewport. |
| `startIndex` | `0` | Index of the first item to reveal. |
| `renderSkeleton` | – | Rendered in place of items the wave has not reached yet. |
| `getItemKey` | item index | Stable key per item. |
| `scrollToIndex` | – | Scrolls to the index whenever the value changes. |
| `outerElement` | – | Tag name or component for the scroll container. |
| `innerElement` | – | Tag name or component for the inner sizer. |
| `transition` | `false` | Fade newly revealed items in. |
| `snapToBatch` | `false` | Align to the nearest batch boundary after scrolling stops. Assumes fixed heights. |
| `onEndReached` | – | Called once each time the user reaches the end of the scroll area. |
| `endReachedThreshold` | `10` | Distance in pixels from the bottom that counts as the end. |
| `onScroll` | – | Called with the current `scrollTop`, at most once per animation frame. |
| `keyboardNavigation` | `false` | Enable ArrowUp/ArrowDown, PageUp/PageDown, Home and End. |
| `renderStickyHeader` | – | Renders a sticky header for the group of the topmost visible item. |
| `groupByKey` | – | Property name or function that yields an item's group label. |
| `className`, `style` | – | Passed to the scroll container. |
| `ariaLabel` | – | Accessible label for the scroll container. |

### Imperative handle

Attach a ref to `VirtualRenderWave` to get a `VirtualRenderWaveHandle`:

| Method | Description |
| --- | --- |
| `scrollTo(index, behavior?)` | Scroll so the item at `index` sits at the top of the viewport. |
| `scrollToOffset(px, behavior?)` | Scroll to a pixel offset. |
| `getVisibleIndexes()` | Indexes currently rendered and revealed. |
| `getScrollElement()` | The scrollable outer element, or `null` before mount. |

Recipes and the full reference live on the docs site:
[renderwave.sudo-ezekiel.com/api-reference](https://renderwave.sudo-ezekiel.com/api-reference/).

## Local demo

```bash
git clone https://github.com/sudo-ezekiel/react-render-wave
cd react-render-wave
npm install
npm run demo
```

## Roadmap

- Horizontal virtualization
- Table layout with expandable rows

## Contributing

Contributions are welcome.

```bash
npm install
npm test          # vitest
npm run demo      # local playground
npm run build     # dist (ESM + CJS + types)
npm run typecheck
```

## Acknowledgements

Thanks to [@sequencemedia](https://github.com/sequencemedia) for helping squash
a tricky bug early on.

## License

[MIT](https://github.com/sudo-ezekiel/react-render-wave/blob/main/LICENSE)
