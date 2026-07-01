#!/usr/bin/env node

/**
 * Deploy data assets to Cloudflare R2.
 *
 * Usage:
 *   pnpm run deploy-data              — interactive prompt
 *   pnpm run deploy-data small        — manifest, norms, hg19map, gene catalog, demo individuals, pgs_detail, duckdb deps, OG images
 *   pnpm run deploy-data all          — small files + all trait packs
 *   pnpm run deploy-data trait EFO_0004340  — single trait pack only
 *
 * @module scripts/deploy-data
 */

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import readline from 'node:readline';
import { loadDeployLog, saveDeployLog, upload } from './deploy-helpers.js';

const BUCKET = 'asili-data';
const DATA_DIR = resolve(import.meta.dirname, '../../asili-lab/data_out');
const MANIFEST = `${DATA_DIR}/trait_manifest.json`;
const PACKS_DIR = `${DATA_DIR}/packs/asili`;
const PGS_DETAIL_DIR = `${DATA_DIR}/pgs_detail`;
const DEPS_DIR = resolve(import.meta.dirname, '../src/deps/duckdb');
const OG_DIR = resolve(import.meta.dirname, '../dist');

const MIME_MAP = {
  '.js': 'application/javascript',
  '.mjs': 'application/javascript',
  '.wasm': 'application/wasm',
};

const args = process.argv.slice(2);
const command = args[0];
const extra = args[1];
const force = args.includes('--force');

const state = { deployed: loadDeployLog(), uploadCount: 0, skipCount: 0 };
const up = (local, remote, ct = null) => upload(local, remote, state, BUCKET, force, ct);

function deploySmall() {
  console.log('\n📋 Small files...');
  up(`${DATA_DIR}/trait_manifest.json`, 'trait_manifest.json', 'application/json');
  up(`${DATA_DIR}/pgs_norm_params.json`, 'pgs_norm_params.json', 'application/json');
  up(`${DATA_DIR}/hg19map.asili`, 'hg19map.asili', 'application/octet-stream');
  up(`${DATA_DIR}/gene_catalog.json`, 'gene_catalog.json', 'application/json');
  up(`${DATA_DIR}/demo-individuals.json`, 'demo-individuals.json', 'application/json');

  console.log('\n📦 PGS detail files...');
  const detailFiles = readdirSync(PGS_DETAIL_DIR).filter((f) => f.endsWith('.json'));
  for (const f of detailFiles) up(`${PGS_DETAIL_DIR}/${f}`, `pgs_detail/${f}`, 'application/json');
  console.log(`  ✓ ${detailFiles.length} detail files`);

  console.log('\n🦆 DuckDB WASM deps...');
  const depFiles = readdirSync(DEPS_DIR);
  for (const f of depFiles) {
    const ext = f.slice(f.lastIndexOf('.'));
    up(`${DEPS_DIR}/${f}`, `deps/duckdb/${f}`, MIME_MAP[ext] || 'application/octet-stream');
  }
  console.log(`  ✓ ${depFiles.length} dep files`);

  console.log('\n🖼️  OG images...');
  let ogCount = 0;
  for (const sub of ['trait', 'gene']) {
    const dir = `${OG_DIR}/${sub}`;
    if (!existsSync(dir)) continue;
    const pngs = readdirSync(dir).filter((f) => f.endsWith('.png'));
    for (const f of pngs) up(`${dir}/${f}`, `og/${sub}/${f}`, 'image/png');
    ogCount += pngs.length;
  }
  console.log(`  ✓ ${ogCount} OG images`);
}

function deployPacks() {
  console.log('\n🧬 Trait packs (manifest-filtered)...');
  const manifest = JSON.parse(readFileSync(MANIFEST, 'utf-8'));
  const traitIds = Object.keys(manifest.traits);
  let i = 0;
  for (const tid of traitIds) {
    const f = `${tid}_hg38.asili`;
    up(`${PACKS_DIR}/${f}`, `packs/asili/${f}`, 'application/octet-stream');
    if (++i % 10 === 0) console.log(`  ... ${i}/${traitIds.length}`);
  }
  console.log(`  ✓ ${traitIds.length} trait packs`);
}

async function prompt() {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  console.log('\n  What to deploy?\n');
  console.log('    1) small  — manifest, norms, hg19map, gene catalog, pgs_detail, duckdb deps, OG images');
  console.log('    2) all    — small files + all trait packs');
  console.log('    3) trait  — single trait pack (will prompt for ID)\n');
  const answer = await new Promise((r) => rl.question('  Choice [1]: ', r));
  const map = { 1: 'small', 2: 'all', 3: 'trait', small: 'small', all: 'all', trait: 'trait' };
  let cmd = map[answer.trim()] || 'small';
  if (cmd === 'trait') {
    const id = await new Promise((r) => rl.question('  Trait ID: ', r));
    rl.close();
    return { cmd, extra: id.trim() };
  }
  rl.close();
  return { cmd, extra: null };
}

async function main() {
  let cmd = command;
  let traitId = extra;

  if (!cmd) {
    const result = await prompt();
    cmd = result.cmd;
    traitId = result.extra;
  }

  console.log(`\n🚀 Deploying data to Cloudflare R2 (${force ? 'force' : 'skip unchanged'})\n`);

  if (cmd === 'small') {
    deploySmall();
  } else if (cmd === 'all') {
    deploySmall();
    deployPacks();
  } else if (cmd === 'trait') {
    if (!traitId) {
      console.error('Usage: pnpm run deploy:data trait <TRAIT_ID>');
      process.exit(1);
    }
    const f = `${traitId}_hg38.asili`;
    console.log(`\n🧬 Single trait: ${f}`);
    up(`${PACKS_DIR}/${f}`, `packs/asili/${f}`, 'application/octet-stream');
  } else {
    console.error(`Unknown command: ${cmd}`);
    console.log('Usage: pnpm run deploy:data [small|all|trait <ID>]');
    process.exit(1);
  }

  console.log(`\n✅ Deploy complete — uploaded: ${state.uploadCount}, skipped: ${state.skipCount} (unchanged)`);
  saveDeployLog(state.deployed);
}

main();
