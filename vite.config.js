import { defineConfig } from 'vite';
import wasm from 'vite-plugin-wasm';
import path from 'path';

export default defineConfig({
  plugins: [wasm()],
  build: {
    target: 'esnext',
    lib: {
      entry: path.resolve(__dirname, 'src/index.ts'),
      name: 'ReactRenderWave',
      fileName: 'index',
      formats: ['es']
    },
    rollupOptions: {
      external: ['react', 'react-dom'], // ✅ Prevent bundling React
      output: {
        entryFileNames: '[name].js',
        globals: {
          react: 'React',
          'react-dom': 'ReactDOM'
        }
      }
    }
  }
});