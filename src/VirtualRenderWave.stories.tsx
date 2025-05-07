import React, { useRef, useState } from "react";
import {
  VirtualRenderWave,
  VirtualRenderWaveProps,
  VirtualRenderWaveHandle,
} from "./VirtualRenderWave";

export default {
  title: "Components/VirtualRenderWave",
  component: VirtualRenderWave,
  argTypes: {
    itemHeight: {
      control: "number",
      description: "Height of each rendered item in pixels.",
      defaultValue: 40,
    },
    containerHeight: {
      control: "number",
      description: "Height of the scrollable container in pixels.",
      defaultValue: 400,
    },
    batchSize: {
      control: "number",
      description: "Number of items revealed per render wave.",
      defaultValue: 20,
    },
    overscan: {
      control: "number",
      description:
        "Extra items to render outside the visible viewport for smoother scroll.",
      defaultValue: 5,
    },
    transition: {
      control: "boolean",
      description: "Enable fade-in animation for new items.",
      defaultValue: false,
    },
    snapToBatch: {
      control: "boolean",
      description: "Snap scrolling to the nearest batch boundary.",
      defaultValue: false,
    },
    keyboardNavigation: {
      control: "boolean",
      description: "Enable keyboard scrolling support.",
      defaultValue: false,
    },
  },
};

const items = Array.from({ length: 1000 }, (_, i) => `Item ${i + 1}`);

const storyStyle = {
  padding: 24,
  fontFamily: "Inter, sans-serif",
  fontSize: 16,
  lineHeight: 1.6,
};

const headingStyle = {
  fontSize: 20,
  fontWeight: 600,
  marginBottom: 16,
};

const Template = (args: VirtualRenderWaveProps<string>) => (
  <div style={storyStyle}>
    <h3 style={headingStyle}>🎛️ Playground</h3>
    <VirtualRenderWave {...args} />
  </div>
);

export const Playground:any = Template.bind({});
Playground.args = {
  items,
  itemHeight: 40,
  containerHeight: 400,
  transition: false,
  snapToBatch: false,
  keyboardNavigation: false,
  batchSize: 20,
  overscan: 5,
  renderSkeleton: (i: number) => (
    <div style={{ padding: 8, opacity: 0.3 }}>Loading {i}</div>
  ),
  renderItem: (item: string, i: number) => (
    <div style={{ padding: 8, borderBottom: "1px solid #eee" }}>{item}</div>
  ),
};

export const WithSkeleton = () => (
  <div style={storyStyle}>
    <h3 style={headingStyle}>🦴 With Skeletons</h3>
    <VirtualRenderWave
      items={items}
      itemHeight={40}
      renderItem={(item, i) => (
        <div style={{ padding: 8, borderBottom: "1px solid #eee" }}>{item}</div>
      )}
      renderSkeleton={(i) => (
        <div style={{ padding: 8, opacity: 0.3 }}>Loading {i}</div>
      )}
    />
  </div>
);

export const WithTransition = () => (
  <div style={storyStyle}>
    <h3 style={headingStyle}>✨ With Fade-In Transition</h3>
    <VirtualRenderWave
      items={items}
      itemHeight={40}
      transition
      renderItem={(item, i) => (
        <div style={{ padding: 8, borderBottom: "1px solid #eee" }}>{item}</div>
      )}
      renderSkeleton={(i) => (
        <div style={{ padding: 8, opacity: 0.3 }}>Loading {i}</div>
      )}
    />
  </div>
);

export const SnapToBatch = () => (
  <div style={storyStyle}>
    <h3 style={headingStyle}>🧲 Snap to Batch</h3>
    <p>
      Automatically aligns scroll to the nearest batch after the user scrolls.
    </p>
    <VirtualRenderWave
      items={items}
      itemHeight={40}
      snapToBatch
      renderItem={(item, i) => (
        <div style={{ padding: 8, borderBottom: "1px solid #eee" }}>{item}</div>
      )}
    />
  </div>
);

export const KeyboardNavigation = () => (
  <div style={storyStyle}>
    <h3 style={headingStyle}>⌨️ Keyboard Navigation</h3>
    <p>
      <strong>Use the following keys:</strong>
      <br />
      ⬆️ / ⬇️: scroll by 1 item
      <br />
      ⬆️ PageUp / PageDown ⬇️: scroll by 1 page
      <br />
      ⬅️ Home / End ➡️: jump to start/end
    </p>
    <VirtualRenderWave
      items={items}
      itemHeight={40}
      keyboardNavigation
      renderItem={(item, i) => (
        <div style={{ padding: 8, borderBottom: "1px solid #eee" }}>{item}</div>
      )}
    />
  </div>
);

export const ScrollToIndexWithInput = () => {
  const ref = useRef<VirtualRenderWaveHandle>(null);
  const [index, setIndex] = useState(300);

  return (
    <div style={storyStyle}>
      <h3 style={headingStyle}>🎯 Scroll To Index</h3>
      <label>
        Index:&nbsp;
        <input
          type="number"
          value={index}
          onChange={(e) => setIndex(Number(e.target.value))}
          style={{ width: 80, marginRight: 8 }}
        />
      </label>
      <button onClick={() => ref.current?.scrollTo(index)}>Scroll</button>

      <div style={{ marginTop: 16 }}>
        <VirtualRenderWave
          ref={ref}
          items={items}
          itemHeight={40}
          renderItem={(item, i) => (
            <div style={{ padding: 8, borderBottom: "1px solid #eee" }}>
              {item}
            </div>
          )}
        />
      </div>
    </div>
  );
};
