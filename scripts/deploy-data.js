#!/usr/bin/env node

/**
 * Deploy data assets to Cloudflare R2.
 * Uploads trait packs, norm params, manifest, pgs_detail, and hg19map.
 *
 * Usage:
 *   node scripts/deploy-data.js          # Deploy all
 *   node scripts/deploy-data.js --small  # Deploy only small files
 *   node scripts/deploy-data.js --trait EFO_0004340  # Deploy single trait pack
 */

import { existsSync, readdirSync, readFileSync } from 'fs';
import { resolve } from 'path';
import { loadDeployLog, saveDeployLog, upload } from './deploy-helpers.js';

const BUCKET = 'asili-data';
const DATA_DIR = resolve(import.meta.dirname, '../../asili-lab/data_out');
const MANIFEST = `${DATA_DIR}/trait_manifest.json`;
const NORMS = `${DATA_DIR}/pgs_norm_params.json`;
const HG19MAP = `${DATA_DIR}/hg19map.asili`;
const GENE_CATALOG = `${DATA_DIR}/gene_catalog.json`;
const PGS_DETAIL_DIR = `${DATA_DIR}/pgs_detail`;
const PACKS_DIR = `${DATA_DIR}/packs/asili`;
const OG_DIR = resolve(import.meta.dirname, '../dist');

const args = process.argv.slice(2);
const smallOnly = args.includes('--small');
const force = args.includes('--force');
const singleTrait = args.find((a) => !a.startsWith('--'));

const state = { deployed: loadDeployLog(), uploadCount: 0, skipCount: 0 };
const up = (local, remote, ct = null) => upload(local, remote, state, BUCKET, force, ct);

console.log('🚀 Deploying data to Cloudflare R2\n');

// Small files (always deployed)
console.log('📋 Manifest + norms + hg19map + gene catalog...');
up(MANIFEST, 'trait_manifest.json', 'application/json');
up(NORMS, 'pgs_norm_params.json', 'application/json');
up(HG19MAP, 'hg19map.asili', 'application/octet-stream');
up(GENE_CATALOG, 'gene_catalog.json', 'application/json');

// PGS detail files
console.log('📦 PGS detail files...');
const detailFiles = readdirSync(PGS_DETAIL_DIR).filter((f) => f.endsWith('.json'));
for (const f of detailFiles) {
  up(`${PGS_DETAIL_DIR}/${f}`, `pgs_detail/${f}`, 'application/json');
}
console.log(`  ✓ ${detailFiles.length} detail files\n`);

// DuckDB WASM deps — with correct MIME types
const DEPS_DIR = resolve(import.meta.dirname, '../src/deps/duckdb');
const MIME_MAP = {
  '.js': 'application/javascript',
  '.mjs': 'application/javascript',
  '.wasm': 'application/wasm',
};
console.log('🦆 DuckDB WASM deps...');
const depFiles = readdirSync(DEPS_DIR);
for (const f of depFiles) {
  const ext = f.slice(f.lastIndexOf('.'));
  const ct = MIME_MAP[ext] || 'application/octet-stream';
  up(`${DEPS_DIR}/${f}`, `deps/duckdb/${f}`, ct);
}
console.log(`  ✓ ${depFiles.length} dep files\n`);

// OG images (trait + gene)
console.log('🖼️  OG images...');
const ogTraitDir = `${OG_DIR}/trait`;
const ogGeneDir = `${OG_DIR}/gene`;
let ogCount = 0;
if (existsSync(ogTraitDir)) {
  const traitPngs = readdirSync(ogTraitDir).filter((f) => f.endsWith('.png'));
  for (const f of traitPngs) up(`${ogTraitDir}/${f}`, `og/trait/${f}`, 'image/png');
  ogCount += traitPngs.length;
}
if (existsSync(ogGeneDir)) {
  const genePngs = readdirSync(ogGeneDir).filter((f) => f.endsWith('.png'));
  for (const f of genePngs) up(`${ogGeneDir}/${f}`, `og/gene/${f}`, 'image/png');
  ogCount += genePngs.length;
}
console.log(`  ✓ ${ogCount} OG images\n`);

if (smallOnly) {
  console.log('✅ Small files deployed (--small mode)');
  process.exit(0);
}

// Trait packs — only deploy those referenced in the manifest
if (singleTrait) {
  const file = `${singleTrait}_hg38.asili`;
  console.log(`🧬 Single trait: ${file}`);
  up(`${PACKS_DIR}/${file}`, `packs/asili/${file}`, 'application/octet-stream');
} else {
  console.log('🧬 Trait packs (manifest-filtered)...');
  const manifest = JSON.parse(readFileSync(MANIFEST, 'utf-8'));
  const traitIds = Object.keys(manifest.traits);
  let i = 0;
  for (const tid of traitIds) {
    const f = `${tid}_hg38.asili`;
    up(`${PACKS_DIR}/${f}`, `packs/asili/${f}`, 'application/octet-stream');
    if (++i % 10 === 0) console.log(`  ... ${i}/${traitIds.length}`);
  }
  console.log(`  ✓ ${traitIds.length} trait packs\n`);
}

console.log(`\n✅ Deploy complete`);
console.log(`   Uploaded: ${state.uploadCount}, Skipped: ${state.skipCount} (unchanged)`);
saveDeployLog(state.deployed);
