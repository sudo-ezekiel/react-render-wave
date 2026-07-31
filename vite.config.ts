import { defineConfig } from "vitest/config";

export default defineConfig({
  build: {
    target: "es2020",
    sourcemap: true,
    lib: {
      entry: "src/index.ts",
      formats: ["es", "cjs"],
      fileName: (format) => (format === "es" ? "index.es.js" : "index.cjs"),
    },
    rollupOptions: {
      external: ["react", "react-dom", "react/jsx-runtime"],
      output: {
        // Rollup strips module level directives, so restore the one we need.
        banner: '"use client";',
      },
      onwarn(warning, warn) {
        if (warning.code === "MODULE_LEVEL_DIRECTIVE") return;
        warn(warning);
      },
    },
  },
  test: {
    environment: "jsdom",
    setupFiles: ["test/setup.ts"],
    // Agent worktrees hold a full copy of the tree, so the default glob picks
    // up a second copy of every suite and reports double the tests.
    exclude: ["node_modules/**", "dist/**", ".claude/**"],
  },
});
