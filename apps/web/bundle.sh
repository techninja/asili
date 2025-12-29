#!/bin/bash

# Copy bundled DuckDB files to avoid module cascade
mkdir -p dist
cp node_modules/@duckdb/duckdb-wasm/dist/duckdb-browser.mjs dist/
cp node_modules/@duckdb/duckdb-wasm/dist/duckdb-eh.wasm dist/
cp node_modules/@duckdb/duckdb-wasm/dist/duckdb-browser-eh.worker.js dist/
cp node_modules/@duckdb/duckdb-wasm/dist/duckdb-browser-coi.pthread.worker.js dist/

echo "Bundled files copied to dist/"