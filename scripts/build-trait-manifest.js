#!/usr/bin/env node

/**
 * Fetch or read trait manifest, write to /tmp for the build pipeline.
 * Sources (in order): local symlink → data/ cache → CDN
 * Outputs:
 *   /tmp/trait_manifest.json  — full manifest for OG image generation
 *   data/traits-og.json       — flat array for legacy OG HTML generation
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const CDN = 'https://data.asili.dev/trait_manifest.json';

const SOURCES = [
  resolve(ROOT, '../asili-lab/data_out/trait_manifest.json'),
  resolve(ROOT, 'data/trait_manifest.json'),
];

async function resolveManifest() {
  for (const src of SOURCES) {
    if (existsSync(src)) {
      console.log(`→ Reading manifest from ${src}`);
      return JSON.parse(readFileSync(src, 'utf-8'));
    }
  }
  console.log('→ Fetching manifest from CDN...');
  const resp = await fetch(CDN);
  if (!resp.ok) throw new Error(`CDN fetch failed: ${resp.status}`);
  return resp.json();
}

const manifest = await resolveManifest().catch((e) => {
  console.warn('⚠ Could not load trait_manifest.json —', e.message);
  process.exit(0);
});

// Write to /tmp for OG image generation (never committed, works in any env)
const tmpOut = '/tmp/trait_manifest.json';
writeFileSync(tmpOut, JSON.stringify(manifest));
console.log(`→ Manifest cached to ${tmpOut}`);

// Write flat array for legacy OG HTML generation
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
