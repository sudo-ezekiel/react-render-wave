![React Render Wave](https://raw.githubusercontent.com/sudo-ezekiel/react-render-wave/main/assets/showcase.png)

# React Render Wave

[![npm version](https://img.shields.io/npm/v/react-render-wave)](https://www.npmjs.com/package/react-render-wave)
[![CI](https://github.com/sudo-ezekiel/react-render-wave/actions/workflows/ci.yml/badge.svg)](https://github.com/sudo-ezekiel/react-render-wave/actions/workflows/ci.yml)
[![license](https://img.shields.io/npm/l/react-render-wave)](https://github.com/sudo-ezekiel/react-render-wave/blob/main/LICENSE)

Progressive wave rendering and lightweight virtual scrolling for React lists.

Mounting thousands of components in one commit blocks the main thread. This
library splits that work into small timed batches, so the first paint happens
immediately and the rest streams in while the page stays responsive. For long
lists, `VirtualRenderWave` adds windowing on top: only the rows in view, plus
overscan, exist in the DOM.

No dependencies, about 7 kB gzipped, ESM and CJS with TypeScript types.

**Docs, recipes and runnable examples: [renderwave.sudo-ezekiel.com](https://renderwave.sudo-ezekiel.com)**

## Install

```bash
npm install react-render-wave
```

React 18 or 19 is a peer dependency.

## What you get

Four exports, in increasing order of how much they do for you.

`useVirtualWindow` is the windowing engine with no opinion about markup. It
tells you which items to render, where to place them and how tall the sizer
has to be, measures rows as they mount, and scrolls to an index. Use it when
the markup is yours: a table, a grid, a scroller you already have.

`useRenderWave` is the reveal on its own. It tells you how many items to show
right now and nothing else, so you keep full control of the markup.

`RenderWave` wraps the reveal hook in a component. Everything mounts
eventually, nothing is windowed away. Reach for it when the cost is the
components themselves rather than the number of rows: a grid of charts, a page
of cards that each do layout work.

`VirtualRenderWave` puts the two hooks together and adds the list chrome. Row
offsets come from a prefix-sum cache with binary search, so the scroll math
holds up past 100,000 rows. Heights can be uniform or measured per row. This is
the one you want for a long list.

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

If you would rather keep a small `batchSize`, set `revealMode="viewport"`. The
wave then reveals the rows inside the rendered window instead of counting
forward from the top, and a revealed row stays revealed, so the screen fills
after a few batches no matter where the user has scrolled.

## The hooks

### `useRenderWave`

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

### `useVirtualWindow`

The hook renders nothing and owns no styles. You give it a count and an
estimated row size; it gives you a ref for the scroll container, a ref per
item for measurement, and the items to render with their offsets.

```tsx
import { useCallback } from "react";
import { useVirtualWindow } from "react-render-wave";

function Feed({ posts }: { posts: Post[] }) {
  const getItemKey = useCallback((i: number) => posts[i].id, [posts]);
  const { scrollRef, measureRef, virtualItems, totalSize } = useVirtualWindow({
    count: posts.length,
    estimateSize: 80,
    getItemKey,
  });

  return (
    <div ref={scrollRef} style={{ height: 500, overflowY: "auto" }}>
      <div style={{ position: "relative", height: totalSize }}>
        {virtualItems.map((item) => (
          <article
            key={item.key}
            ref={measureRef(item.index)}
            style={{ position: "absolute", top: item.offset, left: 0, right: 0 }}
          >
            <PostCard post={posts[item.index]} />
          </article>
        ))}
      </div>
    </div>
  );
}
```

Three parts have to line up. The scroll container needs a constrained height
and `overflow: auto`, and takes `scrollRef` (or hand the hook an element you
already own through `getScrollElement`). The element inside it is the sizer;
give it `position: relative` and a height of `totalSize` so the scrollbar
reflects the whole list. Each item is positioned absolutely at `item.offset`
and takes `measureRef(item.index)`, which watches the element with a
ResizeObserver and corrects the offsets below it when it turns out taller or
shorter than the estimate. Skip `measureRef` when every row is the same
height.

Memoize `getItemKey` on the data. Measurements are stored by key, so a reorder
carries each measured height with its item, but a new function identity is
read as a reorder and costs one rebuild of the offsets.

The first render is derived only from `count`, `estimateSize`, `overscan`,
`scrollMargin`, `getItemKey` and the `initial*` options, so server markup and
the first client render agree.

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

### `useVirtualWindow(options)`

| Option | Default | Description |
| --- | --- | --- |
| `count` | required | Number of items in the list. |
| `estimateSize` | required | Size in pixels used for an item until it is measured. A value that is not positive and finite falls back to `1`. |
| `overscan` | `5` | Extra items rendered above and below the viewport. Clamped to a non-negative whole number. |
| `getItemKey` | item index | `(index) => string \| number`. Measurements are stored by key, so a reorder keeps each item's measured size. Memoize it on the data. |
| `getScrollElement` | – | Supply the scroll container from a ref you already own instead of using `scrollRef`. |
| `initialScrollOffset` | `0` | Scroll offset for the first render. Read once. |
| `initialScrollIndex` | – | Index to open at. Wins over `initialScrollOffset`. Read once. |
| `initialViewportSize` | `400` | Viewport size used until the container is measured. Read once. |
| `scrollMargin` | `0` | Pixels between the container's content origin and item 0, for an in-flow header or toolbar above the sizer. |
| `measureSize` | `el => el.offsetHeight` | How an item element is measured. Use `el => el.getBoundingClientRect().height` for fractional heights, such as table rows with collapsed borders. |
| `onScroll` | – | Called with the current scroll offset, at most once per animation frame. Programmatic scrolls and measurement corrections report through it too. |
| `onRangeChange` | – | Called whenever any of the four range bounds changes. |

Returns a `UseVirtualWindowResult`:

| Field | Description |
| --- | --- |
| `scrollRef` | Ref callback for the scroll container. |
| `measureRef(index)` | Ref callback for the item element at `index`. Stable per index. |
| `virtualItems` | The items to render: `{ index, key, offset, size }[]`. `size` is the measured size, or the estimate until measured. |
| `start`, `end` | Rendered range. `end` is exclusive. |
| `visibleStart`, `visibleEnd` | Indexes intersecting the viewport. `visibleEnd` is exclusive. |
| `totalSize` | Size of all items together, for the sizer element. |
| `scrollOffset` | Current scroll offset of the container. |
| `viewportSize` | Current size of the viewport. |
| `offsetOf(index)` | Pixel offset of the top of an item. |
| `sizeOf(index)` | Measured size of an item, or the estimate. |
| `indexAt(offset)` | Index of the item whose span contains a pixel offset. |
| `scrollToIndex(index, options?)` | Scroll so the item is aligned in the viewport. `options` is `{ align?, behavior? }`; `align` is `"start"` (default), `"center"`, `"end"` or `"auto"`, which only scrolls if the item is not already fully visible. `behavior` defaults to `"auto"`. Out of range indexes clamp to the list; `NaN` is ignored. |
| `scrollToOffset(offset, options?)` | Scroll to a pixel offset. `options` is `{ behavior? }`. `NaN` is ignored. |
| `getScrollElement()` | The scroll container, or `null` before it is attached. |

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
| `revealMode` | `"sequential"` | Which rows the wave reveals. `"sequential"` counts forward from `startIndex` regardless of the scroll position. `"viewport"` reveals the rows inside the rendered window in batches and never re-hides a revealed row, so a small `batchSize` still fills the screen on a long list. |
| `renderSkeleton` | – | Rendered in place of items the wave has not reached yet. |
| `getItemKey` | item index | `(item, index) => ItemKey`, where `ItemKey` is `string \| number`. Stable key per item. |
| `scrollToIndex` | – | Scrolls to the index whenever the value changes. |
| `initialScrollOffset` | – | Pixel offset for the first render, read once. The first paint and the server markup already show that window. |
| `initialScrollIndex` | – | Index to open at, read once. Wins over `initialScrollOffset`, and over a controlled `scrollToIndex` at mount. Corrected once the rows above it are measured. |
| `outerElement` | `"div"` | Tag name or `WrapperComponent` for the scroll container. See the note below. |
| `innerElement` | `"div"` | Tag name or `WrapperComponent` for the inner sizer. See the note below. |
| `transition` | `false` | Fade newly revealed items in. The fade is skipped when the user prefers reduced motion. |
| `snapToBatch` | `false` | Align to the nearest batch boundary after scrolling stops. Assumes fixed heights. |
| `onEndReached` | – | Called once each time the user reaches the end of the scroll area, including when the content is shorter than the viewport. |
| `endReachedThreshold` | `10` | Distance in pixels from the bottom that counts as the end. |
| `onScroll` | – | Called with the current `scrollTop`, at most once per animation frame. |
| `onRangeChange` | – | Called after commit whenever the rendered or visible range changes, with `{ start, end, visibleStart, visibleEnd }`. `end` and `visibleEnd` are exclusive. |
| `keyboardNavigation` | `false` | Enable ArrowUp/ArrowDown, PageUp/PageDown, Home and End. Keys are only taken when the scroll container itself has focus, so an input or select inside a row keeps its own key handling. |
| `renderStickyHeader` | – | Renders a sticky header for the group of the topmost visible item. |
| `groupByKey` | – | Property name or function that yields an item's group label. |
| `className`, `style` | – | Passed to the scroll container. |
| `ariaLabel` | – | Accessible label for the scroll container. |

A custom `outerElement` or `innerElement` receives `WrapperProps` and must
spread every prop onto the DOM node it renders, `ref` included, because the
list scrolls and measures through that ref. On React 19 the ref arrives as an
ordinary prop. On React 18 a plain function component never receives it, so
wrap the component in `forwardRef` and attach the forwarded ref to the node.
A wrapper that drops the ref leaves the list unable to scroll or measure; the
only sign is a `console.error` in development naming the wrapper.

```tsx
import { forwardRef } from "react";
import type { WrapperProps } from "react-render-wave";

const Scroller = forwardRef<HTMLDivElement, WrapperProps>(function Scroller(
  { children, ...rest },
  ref
) {
  return (
    <div ref={ref} {...rest} className="scroller">
      {children}
    </div>
  );
});

<VirtualRenderWave outerElement={Scroller} ... />;
```

### Imperative handle

Attach a ref to `VirtualRenderWave` to get a `VirtualRenderWaveHandle`:

| Method | Description |
| --- | --- |
| `scrollTo(index, options?)` | Scroll to the item at `index`. `options` is a `ScrollBehavior` string or `{ align?, behavior? }`. `align` is `"start"` (default), `"center"`, `"end"` or `"auto"`, which only scrolls if the item is not already fully visible. `behavior` defaults to `"smooth"`. |
| `scrollToOffset(px, behavior?)` | Scroll to a pixel offset. `behavior` defaults to `"smooth"`. |
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
- Table layout with expandable rows. `useVirtualWindow` gets you most of the
  way to a virtualized table today; the built-in layout is still to come.

## Contributing

Contributions are welcome.

```bash
npm install
npm test           # vitest
npm run demo       # local playground
npm run build      # dist (ESM + CJS + types)
npm run typecheck
npm run check:pkg  # publint + arethetypeswrong against the packed tarball
```

CI runs the same checks on Node 20 and 22, and a separate job reinstalls
React 18 and runs the typecheck and tests against it, so a change that only
works on React 19 fails there.

## Acknowledgements

Thanks to [@sequencemedia](https://github.com/sequencemedia) for helping squash
a tricky bug early on.

## License

[MIT](https://github.com/sudo-ezekiel/react-render-wave/blob/main/LICENSE)
