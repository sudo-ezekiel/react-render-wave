#!/bin/bash
set -e

# Install Rust and wasm-pack
curl https://sh.rustup.rs -sSf | sh -s -- -y
export PATH="$HOME/.cargo/bin:$PATH"
cargo install wasm-pack

# Build the Rust WASM project
cd wasm
wasm-pack build --target web

# Build the frontend Storybook
cd ..
npm install
npm run build-storybook
