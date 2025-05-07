import { StorybookConfig } from "@storybook/react-vite";
import viteWasm from "vite-plugin-wasm";

const config: StorybookConfig = {
  framework: {
    name: "@storybook/react-vite",
    options: {},
  },
  stories: ["../src/**/*.stories.@(ts|tsx)"],
  addons: [
    '@storybook/addon-essentials',
    '@storybook/addon-links',
  ],
  viteFinal: async (config) => {
    // Ensure Vite uses 'esnext' for top-level await support
    config.esbuild = config.esbuild || {};
    config.esbuild.target = 'esnext'; // Allow top-level await

    // Add wasm plugin if not already added
    config.plugins = config.plugins || [];
    config.plugins.push(viteWasm());

    return config;
  },
};

export default config;
