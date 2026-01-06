import { build } from 'esbuild';
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'fs';

console.log('🔄 Building dependencies...');

mkdirSync('deps', { recursive: true });

// Bundle individual dependencies
const deps = [
  {
    name: 'zustand',
    entry: 'node_modules/zustand/esm/index.js',
    output: 'deps/zustand.js'
  },
  {
    name: 'duckdb',
    entry: 'node_modules/@duckdb/duckdb-wasm/dist/duckdb-browser.mjs',
    output: 'deps/duckdb.js'
  }
];

for (const dep of deps) {
  await build({
    entryPoints: [dep.entry],
    bundle: true,
    format: 'esm',
    outfile: dep.output,
    external: [],
    minify: true,
    sourcemap: false
  });
  console.log(`✅ Built ${dep.name}`);
}

// Copy DuckDB WASM files
mkdirSync('deps/wasm', { recursive: true });
copyFileSync(
  'node_modules/@duckdb/duckdb-wasm/dist/duckdb-eh.wasm',
  'deps/wasm/duckdb-eh.wasm'
);

const workerContent = readFileSync(
  'node_modules/@duckdb/duckdb-wasm/dist/duckdb-browser-eh.worker.js',
  'utf8'
).replace(/\/\/# sourceMappingURL=.*$/gm, '');
writeFileSync('deps/wasm/duckdb-browser-eh.worker.js', workerContent);

const pthreadContent = readFileSync(
  'node_modules/@duckdb/duckdb-wasm/dist/duckdb-browser-coi.pthread.worker.js',
  'utf8'
).replace(/\/\/# sourceMappingURL=.*$/gm, '');
writeFileSync('deps/wasm/duckdb-browser-coi.pthread.worker.js', pthreadContent);

console.log('✅ Dependencies built to deps/');
