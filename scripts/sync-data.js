#!/usr/bin/env node

/**
 * Sync data assets from data.asili.dev into src/data/ for local development.
 * Local files are never overwritten unless --force is passed.
 * The dev server already serves src/data/ first and falls back to CDN,
 * so synced files are used automatically without any other config changes.
 *
 * Usage:
 *   pnpm run sync           — interactive prompt
 *   pnpm run sync small     — manifest, norms, hg19map, gene catalog, demo individuals
 *   pnpm run sync all       — small files + all trait packs + pgs_detail
 *   pnpm run sync trait EFO_0004340  — single trait pack only
 *
 * @module scripts/sync-data
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync, statSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import readline from 'node:readline';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const DATA_DIR = resolve(ROOT, 'src/data');
const BASE_URL = 'https://data.asili.dev';

const args = process.argv.slice(2);
const command = args[0];
const extra = args[1];
const force = args.includes('--force');

let fetched = 0;
let skipped = 0;

/**
 * @param {string} remotePath
 * @param {string} localPath
 */
async function syncFile(remotePath, localPath) {
  if (!force && existsSync(localPath)) {
    skipped++;
    return;
  }
  const url = `${BASE_URL}/${remotePath}`;
  const res = await fetch(url);
  if (!res.ok) {
    console.warn(`  ✗ ${remotePath} (${res.status})`);
    return;
  }
  mkdirSync(dirname(localPath), { recursive: true });
  writeFileSync(localPath, Buffer.from(await res.arrayBuffer()));
  const size = statSync(localPath).size;
  console.log(`  ↓ ${remotePath} (${fmtSize(size)})`);
  fetched++;
}

/** @param {number} bytes @returns {string} */
function fmtSize(bytes) {
  if (bytes >= 1e6) return `${(bytes / 1e6).toFixed(1)} MB`;
  if (bytes >= 1e3) return `${(bytes / 1e3).toFixed(0)} KB`;
  return `${bytes} B`;
}

async function syncSmall() {
  console.log('\n📋 Small files...');
  const files = [
    'trait_manifest.json',
    'pgs_norm_params.json',
    'hg19map.asili',
    'gene_catalog.json',
    'demo-individuals.json',
  ];
  for (const f of files) await syncFile(f, resolve(DATA_DIR, f));

  console.log('\n🦆 DuckDB WASM deps...');
  const DEPS_DIR = resolve(ROOT, 'src/deps/duckdb');
  const depFiles = [
    'duckdb.js',
    'duckdb-browser.mjs',
    'duckdb-browser-eh.worker.js',
    'duckdb-browser-mvp.worker.js',
    'duckdb-eh.wasm',
    'duckdb-mvp.wasm',
  ];
  for (const f of depFiles) await syncFile(`deps/duckdb/${f}`, resolve(DEPS_DIR, f));
}

async function syncPgsDetail(manifest) {
  const ids = Object.keys(manifest.traits);
  console.log(`\n📦 PGS detail files (${ids.length})...`);
  for (const id of ids) {
    const f = `${id}.json`;
    await syncFile(`pgs_detail/${f}`, resolve(DATA_DIR, 'pgs_detail', f));
  }
}

async function syncPacks(manifest) {
  const ids = Object.keys(manifest.traits);
  console.log(`\n🧬 Trait packs (${ids.length})...`);
  let i = 0;
  for (const id of ids) {
    const f = `${id}_hg38.asili`;
    await syncFile(`packs/asili/${f}`, resolve(DATA_DIR, 'packs', 'asili', f));
    if (++i % 10 === 0) console.log(`  ... ${i}/${ids.length}`);
  }
}

async function loadManifest() {
  const local = resolve(DATA_DIR, 'trait_manifest.json');
  if (existsSync(local)) return JSON.parse(readFileSync(local, 'utf-8'));
  console.log('  (fetching manifest from CDN to enumerate traits...)');
  const res = await fetch(`${BASE_URL}/trait_manifest.json`);
  return res.json();
}

async function prompt() {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  console.log('\n  What to sync?\n');
  console.log('    1) small  — manifest, norms, hg19map, gene catalog, demo individuals');
  console.log('    2) all    — small files + all trait packs + pgs_detail\n');
  const answer = await new Promise((r) => rl.question('  Choice [1]: ', r));
  rl.close();
  const map = { 1: 'small', 2: 'all', small: 'small', all: 'all' };
  return map[answer.trim()] || 'small';
}

async function main() {
  let cmd = command;
  if (!cmd) cmd = await prompt();

  console.log(`\n🔄 Syncing data assets → src/data/ (${force ? 'force' : 'skip existing'})\n`);

  if (cmd === 'small') {
    await syncSmall();
  } else if (cmd === 'all') {
    await syncSmall();
    const manifest = await loadManifest();
    await syncPgsDetail(manifest);
    await syncPacks(manifest);
  } else if (cmd === 'trait') {
    if (!extra) {
      console.error('Usage: pnpm run sync trait <TRAIT_ID>');
      process.exit(1);
    }
    const f = `${extra}_hg38.asili`;
    console.log(`\n🧬 Single trait: ${f}`);
    await syncFile(`packs/asili/${f}`, resolve(DATA_DIR, 'packs', 'asili', f));
  } else {
    console.error(`Unknown command: ${cmd}`);
    console.log('Usage: pnpm run sync [small|all|trait <ID>]');
    process.exit(1);
  }

  console.log(`\n✅ Sync complete — fetched: ${fetched}, skipped: ${skipped} (already local)`);
}

main();
