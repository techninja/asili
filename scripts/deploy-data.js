#!/usr/bin/env node

/**
 * Deploy data assets to Cloudflare R2.
 * Uploads trait packs, norm params, manifest, pgs_detail, and hg19map.
 *
 * Prerequisites:
 *   - wrangler CLI authenticated (`npx wrangler login`)
 *   - R2 bucket created: `npx wrangler r2 bucket create asili-data`
 *   - Custom domain configured in Cloudflare dashboard for data.asili.dev
 *
 * Usage:
 *   node scripts/deploy-data.js          # Deploy all
 *   node scripts/deploy-data.js --small  # Deploy only small files (manifest, norms, detail, hg19map)
 *   node scripts/deploy-data.js --trait EFO_0004340  # Deploy single trait pack
 */

import { execSync } from 'child_process';
import { readdirSync, statSync, readFileSync, writeFileSync, existsSync } from 'fs';
import { resolve } from 'path';

const BUCKET = 'asili-data';
const DATA_DIR = resolve(import.meta.dirname, '../../asili-lab/data_out');
const MANIFEST = `${DATA_DIR}/trait_manifest.json`;
const NORMS = `${DATA_DIR}/pgs_norm_params.json`;
const HG19MAP = `${DATA_DIR}/hg19map.asili`;
const PGS_DETAIL_DIR = `${DATA_DIR}/pgs_detail`;
const PACKS_DIR = `${DATA_DIR}/packs/asili`;
const DEPLOY_LOG = resolve(import.meta.dirname, '../.deploy-manifest.json');

const args = process.argv.slice(2);
const smallOnly = args.includes('--small');
const force = args.includes('--force');
const singleTrait = args.find(a => !a.startsWith('--'));

/** Load deploy manifest (tracks uploaded file sizes). */
function loadDeployLog() {
  if (existsSync(DEPLOY_LOG)) return JSON.parse(readFileSync(DEPLOY_LOG, 'utf-8'));
  return {};
}
function saveDeployLog(log) {
  writeFileSync(DEPLOY_LOG, JSON.stringify(log, null, 2));
}

let deployed = loadDeployLog();
let uploadCount = 0;
let skipCount = 0;

const MAX_WRANGLER_SIZE = 300 * 1024 * 1024; // 300 MB wrangler limit

// R2 S3-compatible endpoint — set these env vars or use ~/.aws/credentials with profile
const R2_ENDPOINT = process.env.R2_ENDPOINT || `https://${process.env.CF_ACCOUNT_ID}.r2.cloudflarestorage.com`;

function upload(localPath, remotePath, contentType = null) {
  const localSize = statSync(localPath).size;
  const localMtime = statSync(localPath).mtimeMs;

  // Skip if size and mtime match previous deploy
  if (!force && deployed[remotePath] &&
      deployed[remotePath].size === localSize &&
      deployed[remotePath].mtime === localMtime) {
    skipCount++;
    return;
  }

  if (localSize > MAX_WRANGLER_SIZE) {
    // Use AWS CLI with R2 S3 endpoint for large files
    const ct = contentType ? `--content-type ${contentType}` : '';
    const cmd = `aws s3 cp ${localPath} s3://${BUCKET}/${remotePath} --endpoint-url ${R2_ENDPOINT} ${ct}`;
    console.log(`  ↑ ${remotePath} (${fmtSize(localSize)}) [s3]`);
    execSync(cmd, {
      stdio: 'pipe',
      timeout: 600000,
      env: {
        ...process.env,
        AWS_DEFAULT_REGION: 'auto',
        AWS_SHARED_CREDENTIALS_FILE: '',
        AWS_CONFIG_FILE: '',
      },
    });
  } else {
    const ct = contentType ? `--content-type ${contentType}` : '';
    const cmd = `npx wrangler r2 object put ${BUCKET}/${remotePath} --file ${localPath} --remote ${ct}`;
    console.log(`  ↑ ${remotePath} (${fmtSize(localSize)})`);
    execSync(cmd, { stdio: 'pipe' });
  }

  deployed[remotePath] = { size: localSize, mtime: localMtime };
  // Save after each upload so we can resume on failure
  saveDeployLog(deployed);
  uploadCount++;
}

function fmtSize(bytes) {
  if (bytes >= 1e9) return `${(bytes / 1e9).toFixed(1)} GB`;
  if (bytes >= 1e6) return `${(bytes / 1e6).toFixed(1)} MB`;
  if (bytes >= 1e3) return `${(bytes / 1e3).toFixed(0)} KB`;
  return `${bytes} B`;
}

console.log('🚀 Deploying data to Cloudflare R2\n');

// Small files (always deployed)
console.log('📋 Manifest + norms + hg19map...');
upload(MANIFEST, 'trait_manifest.json', 'application/json');
upload(NORMS, 'pgs_norm_params.json', 'application/json');
upload(HG19MAP, 'hg19map.asili', 'application/octet-stream');

// PGS detail files
console.log('📦 PGS detail files...');
const detailFiles = readdirSync(PGS_DETAIL_DIR).filter(f => f.endsWith('.json'));
for (const f of detailFiles) {
  upload(`${PGS_DETAIL_DIR}/${f}`, `pgs_detail/${f}`, 'application/json');
}
console.log(`  ✓ ${detailFiles.length} detail files\n`);

if (smallOnly) {
  console.log('✅ Small files deployed (--small mode)');
  process.exit(0);
}

// Trait packs
if (singleTrait) {
  const file = `${singleTrait}_hg38.asili`;
  const path = `${PACKS_DIR}/${file}`;
  console.log(`🧬 Single trait: ${file}`);
  upload(path, `packs/asili/${file}`, 'application/octet-stream');
} else {
  console.log('🧬 Trait packs (this may take a while)...');
  const packs = readdirSync(PACKS_DIR).filter(f => f.endsWith('.asili'));
  let uploaded = 0;
  const total = packs.length;
  for (const f of packs) {
    const size = statSync(`${PACKS_DIR}/${f}`).size;
    upload(`${PACKS_DIR}/${f}`, `packs/asili/${f}`, 'application/octet-stream');
    uploaded++;
    if (uploaded % 10 === 0) {
      console.log(`  ... ${uploaded}/${total}`);
    }
  }
  console.log(`  ✓ ${uploaded} trait packs\n`);
}

console.log('\n✅ Deploy complete');
console.log(`   Uploaded: ${uploadCount}, Skipped: ${skipCount} (unchanged)`);
saveDeployLog(deployed);
