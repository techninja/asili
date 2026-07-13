#!/usr/bin/env node

/**
 * Sync data assets from data.asili.dev into src/data/ for local development.
 * Usage: pnpm run sync [small|all|trait <ID>] [--force]
 * @module scripts/sync-data
 */

import { existsSync, readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import readline from 'node:readline';
import { syncFile, state } from './sync-helpers.js';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const DATA_DIR = resolve(ROOT, 'src/data');
const BASE_URL = 'https://data.asili.dev';

const args = process.argv.slice(2);
const command = args[0];
const extra = args[1];
const force = args.includes('--force');

/** @param {string} remote @param {string} local */
const sync = (remote, local) => syncFile(BASE_URL, remote, local, force);

async function syncSmall() {
  console.log('\n📋 Small files...');
  const files = [
    'trait_manifest.json',
    'pgs_norm_params.json',
    'hg19map.asili',
    'gene_catalog.json',
    'demo-individuals.json',
  ];
  for (const f of files) await sync(f, resolve(DATA_DIR, f));

  console.log('\n🌐 i18n translation packs...');
  const langManifest = await fetch(`${BASE_URL}/i18n/languages.json`).then((r) =>
    r.ok ? r.json() : null,
  );
  if (langManifest) {
    await sync('i18n/languages.json', resolve(DATA_DIR, 'i18n', 'languages.json'));
    for (const lang of Object.keys(langManifest.languages)) {
      for (const tpl of Object.values(langManifest.files)) {
        const f = tpl.replace('{lang}', lang);
        await sync(`i18n/${f}`, resolve(DATA_DIR, 'i18n', f));
      }
    }
  }

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
  for (const f of depFiles) await sync(`deps/duckdb/${f}`, resolve(DEPS_DIR, f));
}

async function syncPgsDetail(manifest) {
  const ids = Object.keys(manifest.traits);
  console.log(`\n📦 PGS detail files (${ids.length})...`);
  for (const id of ids)
    await sync(`pgs_detail/${id}.json`, resolve(DATA_DIR, 'pgs_detail', `${id}.json`));
}

async function syncPacks(manifest) {
  const ids = Object.keys(manifest.traits);
  console.log(`\n🧬 Trait packs (${ids.length})...`);
  let i = 0;
  for (const id of ids) {
    await sync(
      `packs/asili/${id}_hg38.asili`,
      resolve(DATA_DIR, 'packs', 'asili', `${id}_hg38.asili`),
    );
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
  console.log('\n  What to sync?\n    1) small  2) all\n');
  const answer = await new Promise((r) => rl.question('  Choice [1]: ', r));
  rl.close();
  return { 1: 'small', 2: 'all', small: 'small', all: 'all' }[answer.trim()] || 'small';
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
    console.log(`\n🧬 Single trait: ${extra}_hg38.asili`);
    await sync(
      `packs/asili/${extra}_hg38.asili`,
      resolve(DATA_DIR, 'packs', 'asili', `${extra}_hg38.asili`),
    );
  } else {
    console.error(`Unknown command: ${cmd}`);
    process.exit(1);
  }

  console.log(
    `\n✅ Sync complete — fetched: ${state.fetched}, skipped: ${state.skipped} (already local)`,
  );
}

main();
