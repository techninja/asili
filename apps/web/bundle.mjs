import { build } from 'esbuild';
import { copyFileSync, mkdirSync } from 'fs';

console.log('🔄 Starting esbuild bundle...');

// Bundle DuckDB with all dependencies
await build({
  entryPoints: ['node_modules/@duckdb/duckdb-wasm/dist/duckdb-browser.mjs'],
  bundle: true,
  format: 'esm',
  outfile: 'duckdb-bundle.mjs',
  external: [],
  minify: true,
  sourcemap: false,
  sourceRoot: undefined
});

console.log('📦 Bundle created, copying WASM files...');

// Copy WASM and worker files
mkdirSync('dist', { recursive: true });
copyFileSync('node_modules/@duckdb/duckdb-wasm/dist/duckdb-eh.wasm', 'dist/duckdb-eh.wasm');

// Copy worker files and strip source map comments
import { readFileSync, writeFileSync } from 'fs';
const workerContent = readFileSync('node_modules/@duckdb/duckdb-wasm/dist/duckdb-browser-eh.worker.js', 'utf8')
  .replace(/\/\/# sourceMappingURL=.*$/gm, '');
writeFileSync('dist/duckdb-browser-eh.worker.js', workerContent);

const pthreadContent = readFileSync('node_modules/@duckdb/duckdb-wasm/dist/duckdb-browser-coi.pthread.worker.js', 'utf8')
  .replace(/\/\/# sourceMappingURL=.*$/gm, '');
writeFileSync('dist/duckdb-browser-coi.pthread.worker.js', pthreadContent);

console.log('✅ Bundle complete: duckdb-bundle.mjs');
console.log('✅ WASM files copied to dist/');