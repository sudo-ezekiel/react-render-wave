# React Render Wave

[![npm version](https://img.shields.io/npm/v/react-render-wave)](https://www.npmjs.com/package/react-render-wave)
[![license](https://img.shields.io/npm/l/react-render-wave)](./LICENSE)

Progressive wave rendering and lightweight virtual scrolling for React lists.

Mounting thousands of components in one commit blocks the main thread. This
library splits that work into small timed batches, so the first paint happens
immediately and the rest streams in while the page stays responsive. For long
lists, `VirtualRenderWave` adds windowing on top: only the rows in view, plus
overscan, exist in the DOM.

No dependencies, about 3.7 kB gzipped, ESM and CJS with TypeScript types.

**Docs, recipes and runnable examples: [renderwave.sudo-ezekiel.com](https://renderwave.sudo-ezekiel.com)**

## Status

v3 is not published to npm yet. The registry still serves 2.0.11, which has a
different hook signature and the old WebAssembly build, so `npm install
react-render-wave` will not give you anything described below. Until v3 ships:

```bash
npm install github:sudo-ezekiel/react-render-wave
```

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
`aria-setsize` and `aria-posinset`. React 18 and 19, SSR safe.

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

The first batch renders immediately. Every batch after it is committed on an
animation frame once `interval` has elapsed. Browsers stop serving frames to a
hidden tab, so the reveal parks itself in the background and picks up when the
tab comes forward.

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

Full prop tables, defaults and the imperative handle are on the docs site:
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
- Publish v3 to npm

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

[MIT](./LICENSE)
