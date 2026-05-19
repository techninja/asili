/**
 * `pnpm traits publish` — Upload trait packs and manifest to R2.
 * Filters by tier allowlist. Uses wrangler CLI for multipart upload.
 */
import { execSync } from 'child_process';
import { existsSync, statSync, readdirSync } from 'fs';
import { join } from 'path';
import { loadAllowlist } from '../catalog.js';
import { OUTPUT_DIR } from '../shared-db.js';

const BUCKET = process.env.ASILI_R2_BUCKET || 'asili-data';
const PREFIX = process.env.ASILI_R2_PREFIX || 'v1';
const PACKS_DIR = join(OUTPUT_DIR, 'packs');
const MANIFEST_PATH = join(OUTPUT_DIR, 'trait_manifest.json');

/**
 *
 */
function r2Put(key, filePath, contentType) {
  const cmd = `npx wrangler r2 object put ${BUCKET}/${key} --file "${filePath}" --content-type ${contentType} --remote`;
  execSync(cmd, { stdio: 'pipe' });
}

/**
 *
 */
function formatSize(bytes) {
  if (bytes > 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  if (bytes > 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${bytes} B`;
}

/**
 *
 */
export async function publishData() {
  const tier = process.env.ASILI_TIER || 'tier1_public';
  console.log(`\n=== Publish to R2 (${BUCKET}/${PREFIX}, tier: ${tier}) ===\n`);

  if (!existsSync(PACKS_DIR)) {
    console.error(`✗ Packs directory not found: ${PACKS_DIR}`);
    return;
  }

  const allowlist = loadAllowlist(tier);
  const allPacks = readdirSync(PACKS_DIR).filter(f => f.endsWith('.parquet'));
  const packs = allowlist
    ? allPacks.filter(f => allowlist.has(f.replace('_hg38.parquet', '')))
    : allPacks;

  console.log(`${packs.length} packs to upload (${allPacks.length} total in dir)\n`);

  // Upload manifest first
  if (existsSync(MANIFEST_PATH)) {
    const size = formatSize(statSync(MANIFEST_PATH).size);
    process.stdout.write(`  manifest (${size})...`);
    r2Put(`${PREFIX}/trait_manifest.json`, MANIFEST_PATH, 'application/json');
    console.log(' ✓');
  } else {
    console.log('  ⚠ No trait_manifest.json found — skipping');
  }

  // Upload packs
  let uploaded = 0;
  let totalBytes = 0;
  const errors = [];

  for (const pack of packs) {
    const filePath = join(PACKS_DIR, pack);
    const size = statSync(filePath).size;
    const label = `[${uploaded + 1}/${packs.length}] ${pack} (${formatSize(size)})`;
    process.stdout.write(`  ${label}...`);

    try {
      r2Put(`${PREFIX}/packs/${pack}`, filePath, 'application/octet-stream');
      uploaded++;
      totalBytes += size;
      console.log(' ✓');
    } catch (err) {
      errors.push(pack);
      console.log(` ✗ ${err.message?.split('\n')[0]}`);
    }
  }

  console.log(`\n✓ Published ${uploaded}/${packs.length} packs (${formatSize(totalBytes)})`);
  if (errors.length > 0) console.log(`✗ Failed: ${errors.join(', ')}`);
}
