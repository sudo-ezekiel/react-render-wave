#!/bin/bash
set -e
set -o pipefail

echo "🔧 Installing Rust..."
curl https://sh.rustup.rs -sSf | sh -s -- -y
export PATH="$HOME/.cargo/bin:$PATH"

echo "🔧 Installing wasm-pack..."
cargo install wasm-pack

echo "🔍 Checking wasm-pack path..."
which wasm-pack

echo "🚧 Building WASM package..."
cd wasm
wasm-pack build --target web
cd ..

echo "📦 Installing frontend dependencies..."
npm install

echo "📘 Building Storybook..."
npm run build-storybook
