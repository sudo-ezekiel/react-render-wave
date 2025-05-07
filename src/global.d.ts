declare module "*.wasm?init" {
  const initWasm: (
    moduleOrPath?: WebAssembly.Module | BufferSource
  ) => Promise<any>;
  export default initWasm;
}

declare module "*.wasm?url" {
  const url: string;
  export default url;
}
