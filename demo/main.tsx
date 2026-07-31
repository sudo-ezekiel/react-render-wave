import React, { useCallback, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  RenderWave,
  VirtualRenderWave,
  type VirtualRenderWaveHandle,
} from "../src/index";

type Row = {
  id: number;
  title: string;
  body: string;
  group: string;
};

const LOREM =
  "Progressive rendering keeps the main thread free while long lists stream in. ";

function makeRows(count: number, offset = 0): Row[] {
  return Array.from({ length: count }, (_, i) => {
    const id = offset + i;
    return {
      id,
      title: `Row ${id}`,
      body: LOREM.repeat(1 + (id % 4)),
      group: `Group ${Math.floor(id / 50)}`,
    };
  });
}

function VirtualDemo() {
  const [rows, setRows] = useState(() => makeRows(10_000));
  const [snapToBatch, setSnapToBatch] = useState(false);
  const [transition, setTransition] = useState(true);
  const [dynamicHeights, setDynamicHeights] = useState(false);
  const [targetIndex, setTargetIndex] = useState(500);
  const handle = useRef<VirtualRenderWaveHandle>(null);

  const loadMore = useCallback(() => {
    setRows((prev) => [...prev, ...makeRows(500, prev.length)]);
  }, []);

  return (
    <section>
      <h2>VirtualRenderWave</h2>
      <p className="hint">
        {rows.length.toLocaleString()} rows, windowed rendering, wave reveal,
        sticky group headers, keyboard navigation (focus the list, then use the
        arrow keys, PageUp/PageDown, Home and End). Scrolling to the bottom
        appends 500 more rows.
      </p>
      <div className="controls">
        <label>
          <input
            type="checkbox"
            checked={dynamicHeights}
            onChange={(e) => setDynamicHeights(e.target.checked)}
          />
          Dynamic heights
        </label>
        <label>
          <input
            type="checkbox"
            checked={transition}
            onChange={(e) => setTransition(e.target.checked)}
          />
          Fade in
        </label>
        <label>
          <input
            type="checkbox"
            checked={snapToBatch}
            onChange={(e) => setSnapToBatch(e.target.checked)}
          />
          Snap to batch
        </label>
        <label>
          Index
          <input
            type="number"
            value={targetIndex}
            onChange={(e) => setTargetIndex(Number(e.target.value))}
          />
        </label>
        <button onClick={() => handle.current?.scrollTo(targetIndex)}>
          Scroll to index
        </button>
      </div>
      <VirtualRenderWave
        ref={handle}
        className="list"
        items={rows}
        itemHeight={56}
        containerHeight={440}
        batchSize={200}
        interval={40}
        overscan={6}
        transition={transition}
        snapToBatch={snapToBatch}
        keyboardNavigation
        onEndReached={loadMore}
        ariaLabel="Demo rows"
        getItemKey={(row) => row.id}
        groupByKey="group"
        renderStickyHeader={(group) => (
          <div
            style={{
              padding: "6px 12px",
              fontWeight: 600,
              fontSize: 13,
              background: "#f6f7f9",
              borderBottom: "1px solid #e3e5e8",
            }}
          >
            {group}
          </div>
        )}
        renderItem={(row) => (
          <div
            style={{
              padding: "8px 12px",
              borderBottom: "1px solid #eef0f2",
              overflow: "hidden",
            }}
          >
            <strong>{row.title}</strong>
            <div style={{ color: "#5b616b", fontSize: 13 }}>
              {dynamicHeights ? row.body : row.body.slice(0, 60)}
            </div>
          </div>
        )}
        renderSkeleton={(i) => (
          <div style={{ padding: "8px 12px", opacity: 0.35 }}>
            Loading row {i}...
          </div>
        )}
      />
    </section>
  );
}

function WaveDemo() {
  const [runId, setRunId] = useState(0);
  const [done, setDone] = useState(false);
  const cells = Array.from({ length: 400 }, (_, i) => i);

  return (
    <section>
      <h2>RenderWave</h2>
      <p className="hint">
        400 cells mounted in waves of 16 every 30 ms, so the first paint stays
        instant. {done ? "Done." : "Rendering..."}
      </p>
      <div className="controls">
        <button
          onClick={() => {
            setDone(false);
            setRunId((n) => n + 1);
          }}
        >
          Replay
        </button>
      </div>
      <div
        key={runId}
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(28px, 1fr))",
          gap: 4,
        }}
      >
        <RenderWave
          items={cells}
          batchSize={16}
          interval={30}
          onComplete={() => setDone(true)}
          renderItem={(cell) => (
            <div
              key={cell}
              style={{
                height: 28,
                borderRadius: 4,
                background: `hsl(${(cell * 7) % 360} 70% 60%)`,
              }}
            />
          )}
        />
      </div>
    </section>
  );
}

function App() {
  return (
    <>
      <h1>react-render-wave</h1>
      <VirtualDemo />
      <WaveDemo />
    </>
  );
}

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
