import { StorybookConfig } from "@storybook/react-vite";
import viteWasm from "vite-plugin-wasm";

const config: StorybookConfig = {
  framework: {
    name: "@storybook/react-vite",
    options: {},
  },
  stories: ["../src/**/*.stories.@(ts|tsx)"],
  addons: ["@storybook/addon-essentials"],
  viteFinal: async (config) => {
    config.plugins = config.plugins || [];
    config.plugins.push(viteWasm());
    return config;
  },
};

export default config;
