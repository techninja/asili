#!/usr/bin/env node

/**
 * Fetch or read trait manifest and write a flat array for OG generation.
 * Outputs: data/traits-og.json
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const LOCAL = resolve(ROOT, '../asili-lab/data_out/trait_manifest.json');
const CDN = 'https://data.asili.dev/trait_manifest.json';

let manifest;
if (existsSync(LOCAL)) {
  manifest = JSON.parse(readFileSync(LOCAL, 'utf-8'));
} else {
  console.log('→ Fetching manifest from CDN...');
  const resp = await fetch(CDN);
  if (!resp.ok) {
    console.warn('⚠ Could not fetch trait_manifest.json — skipping');
    process.exit(0);
  }
  manifest = await resp.json();
}

// Write full manifest for OG image generation (route config references this)
const manifestOut = resolve(ROOT, 'src/data/trait_manifest.json');
const manifestDir = resolve(ROOT, 'src/data');
if (!existsSync(manifestDir)) mkdirSync(manifestDir, { recursive: true });
console.log(`→ Writing manifest to ${manifestOut} (dir exists: ${existsSync(manifestDir)})`);
writeFileSync(manifestOut, JSON.stringify(manifest));

const traits = Object.entries(manifest.traits).map(([id, t]) => ({
  slug: id,
  name: t.name,
  emoji: t.emoji,
  description: t.description?.slice(0, 160) || `Explore your polygenic score for ${t.name}.`,
  image: t.cover_image?.url || 'https://asili.dev/og-image.png',
}));

const outDir = resolve(ROOT, 'data');
mkdirSync(outDir, { recursive: true });
writeFileSync(resolve(outDir, 'traits-og.json'), JSON.stringify(traits, null, 2));
console.log(`✓ Trait OG manifest: ${traits.length} traits → data/traits-og.json`);
