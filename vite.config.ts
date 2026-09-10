import { defineConfig } from "vitest/config";
import dts from "vite-plugin-dts";

export default defineConfig({
  plugins: [
    dts({
      tsconfigPath: "./tsconfig.build.json",
      // One bundled declaration file, so nothing ships an extensionless
      // relative import that node16 resolution cannot follow.
      bundleTypes: true,
      // The require condition needs its own declaration file, otherwise
      // node16 reads the ESM declarations as CJS and reports a masquerade.
      outDirs: ["dist", { dir: "dist", moduleFormat: "cjs" }],
    }),
  ],
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
    // Anchored at the project root on purpose. The default glob is recursive,
    // so any nested checkout of this repo contributes a second copy of every
    // suite and the run reports double the tests.
    include: ["test/**/*.{test,spec}.{ts,tsx}"],
  },
});
