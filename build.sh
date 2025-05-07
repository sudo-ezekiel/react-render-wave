#!/bin/bash
set -e

# Install Rust
curl https://sh.rustup.rs -sSf | sh -s -- -y

# Set up environment for Rust + wasm-pack
export PATH="$HOME/.cargo/bin:$PATH"
source "$HOME/.cargo/env" || true  # optional fallback

# Install wasm-pack
cargo install wasm-pack

# ✅ Make sure wasm-pack is available
which wasm-pack  # optional: this will print the path if installed correctly

# Build wasm module
cd wasm
wasm-pack build --target web

# Build frontend Storybook
cd ../frontend
npm install
npm run build-storybook
