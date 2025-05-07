declare module "*.wasm?init" {
  const initWasm: (
    moduleOrPath?: WebAssembly.Module | BufferSource
  ) => Promise<any>;
  export default initWasm;
}
