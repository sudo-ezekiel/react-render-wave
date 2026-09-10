import React, { useCallback, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  RenderWave,
  VirtualRenderWave,
  useVirtualWindow,
  type RevealMode,
  type ScrollAlign,
  type VirtualRange,
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
  const [revealMode, setRevealMode] = useState<RevealMode>("viewport");
  const [batchSize, setBatchSize] = useState(20);
  const [targetIndex, setTargetIndex] = useState(500);
  const [align, setAlign] = useState<ScrollAlign>("start");
  const [range, setRange] = useState<VirtualRange | null>(null);
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
        appends 500 more rows. In viewport mode the wave follows the window, so
        a small batch size still fills the screen quickly.
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
          Reveal mode
          <select
            value={revealMode}
            onChange={(e) => setRevealMode(e.target.value as RevealMode)}
          >
            <option value="sequential">sequential</option>
            <option value="viewport">viewport</option>
          </select>
        </label>
        <label>
          Batch size
          <input
            type="number"
            min={1}
            value={batchSize}
            onChange={(e) => setBatchSize(Number(e.target.value))}
          />
        </label>
        <label>
          Index
          <input
            type="number"
            value={targetIndex}
            onChange={(e) => setTargetIndex(Number(e.target.value))}
          />
        </label>
        <label>
          Align
          <select
            value={align}
            onChange={(e) => setAlign(e.target.value as ScrollAlign)}
          >
            <option value="start">start</option>
            <option value="center">center</option>
            <option value="end">end</option>
            <option value="auto">auto</option>
          </select>
        </label>
        <button
          onClick={() => handle.current?.scrollTo(targetIndex, { align })}
        >
          Scroll to index
        </button>
      </div>
      <p className="hint" style={{ marginTop: 0 }}>
        {range
          ? `onRangeChange: rendering ${range.start} to ${range.end}, ${
              range.visibleEnd - range.visibleStart
            } rows in view (${range.visibleStart} to ${range.visibleEnd}).`
          : "onRangeChange has not fired yet."}
      </p>
      <VirtualRenderWave
        ref={handle}
        className="list"
        items={rows}
        itemHeight={56}
        containerHeight={440}
        batchSize={batchSize}
        interval={40}
        revealMode={revealMode}
        overscan={6}
        transition={transition}
        snapToBatch={snapToBatch}
        keyboardNavigation
        onRangeChange={setRange}
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

type Message = { id: number; author: string; body: string };

const MESSAGES: Message[] = Array.from({ length: 5000 }, (_, i) => ({
  id: i,
  author: `user${i % 37}`,
  body: LOREM.repeat(1 + (i % 5)).slice(0, 40 + ((i * 37) % 260)),
}));

function HookDemo() {
  const [range, setRange] = useState<VirtualRange | null>(null);
  const getItemKey = useCallback((index: number) => MESSAGES[index].id, []);

  const {
    scrollRef,
    measureRef,
    virtualItems,
    totalSize,
    scrollToIndex,
    start,
    end,
  } = useVirtualWindow({
    count: MESSAGES.length,
    estimateSize: 72,
    overscan: 4,
    getItemKey,
    initialScrollIndex: 2500,
    initialViewportSize: 320,
    onRangeChange: setRange,
  });

  return (
    <section>
      <h2>useVirtualWindow</h2>
      <p className="hint">
        The same windowing engine with the component peeled away. 5,000 messages
        of differing heights, measured as they mount, opened at index 2,500 on
        the first paint through <code>initialScrollIndex</code>. Nothing here is
        rendered by the library: the hook returns offsets and a ref, and the
        markup below is ordinary divs.
      </p>
      <div className="controls">
        <button onClick={() => scrollToIndex(0)}>Top</button>
        <button onClick={() => scrollToIndex(2500, { align: "center" })}>
          Message 2,500, centred
        </button>
        <button onClick={() => scrollToIndex(4999, { align: "end" })}>
          Last message
        </button>
        <span style={{ color: "#5b616b" }}>
          rendering {start} to {end} of {MESSAGES.length}, sizer{" "}
          {Math.round(totalSize).toLocaleString()}px
          {range ? `, ${range.visibleEnd - range.visibleStart} in view` : ""}
        </span>
      </div>
      <div
        ref={scrollRef}
        className="list"
        style={{ height: 320, overflowY: "auto" }}
      >
        <div style={{ position: "relative", height: totalSize }}>
          {virtualItems.map((item) => {
            const message = MESSAGES[item.index];
            return (
              <div
                key={item.key}
                ref={measureRef(item.index)}
                style={{
                  position: "absolute",
                  top: item.offset,
                  left: 0,
                  right: 0,
                  padding: "8px 12px",
                  borderBottom: "1px solid #eef0f2",
                }}
              >
                <strong style={{ fontSize: 13 }}>
                  {message.author}{" "}
                  <span style={{ color: "#9aa0a6" }}>#{message.id}</span>
                </strong>
                <div style={{ color: "#5b616b", fontSize: 13 }}>
                  {message.body}
                </div>
              </div>
            );
          })}
        </div>
      </div>
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
      <HookDemo />
      <WaveDemo />
    </>
  );
}

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
