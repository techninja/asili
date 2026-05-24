#!/usr/bin/env node

/**
 * Generate static HTML pages with Open Graph metadata for each trait.
 * These are served by Cloudflare Pages for link preview crawlers,
 * then the SPA takes over client-side.
 *
 * Run after the main build: node scripts/build-og.js
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const DIST = resolve(ROOT, 'dist');
const LOCAL_MANIFEST = resolve(ROOT, '../asili-lab/data_out/trait_manifest.json');
const CDN_MANIFEST = 'https://data.asili.dev/trait_manifest.json';

let manifest;
if (existsSync(LOCAL_MANIFEST)) {
  manifest = JSON.parse(readFileSync(LOCAL_MANIFEST, 'utf-8'));
} else {
  console.log('→ Fetching manifest from CDN...');
  const resp = await fetch(CDN_MANIFEST);
  if (!resp.ok) {
    console.warn('⚠ Could not fetch trait_manifest.json — skipping OG generation');
    process.exit(0);
  }
  manifest = await resp.json();
}
const traits = manifest.traits;
const baseHtml = readFileSync(resolve(DIST, 'index.html'), 'utf-8');

let count = 0;

for (const [traitId, trait] of Object.entries(traits)) {
  const title = `Asili | ${trait.emoji} ${trait.name}`;
  const description = trait.description
    ? trait.description.slice(0, 160)
    : `Explore your polygenic score for ${trait.name}. Privacy-first, browser-only analysis.`;
  const url = `https://app.asili.dev/beta/trait/${traitId}`;
  const image = trait.cover_image?.url || 'https://asili.dev/og-image.png';

  // Replace OG tags in the base HTML
  let html = baseHtml;
  html = html.replace(/<title>.*?<\/title>/, `<title>${title}</title>`);
  html = html.replace(
    /<meta property="og:title"[^>]*\/>/,
    `<meta property="og:title" content="${escHtml(title)}" />`,
  );
  html = html.replace(
    /<meta property="og:description"[^>]*\/>/,
    `<meta property="og:description" content="${escHtml(description)}" />`,
  );
  html = html.replace(
    /<meta property="og:url"[^>]*\/>/,
    `<meta property="og:url" content="${url}" />`,
  );
  html = html.replace(
    /<meta property="og:image"[^>]*\/>/,
    `<meta property="og:image" content="${escHtml(image)}" />`,
  );
  html = html.replace(
    /<meta name="twitter:title"[^>]*\/>/,
    `<meta name="twitter:title" content="${escHtml(title)}" />`,
  );
  html = html.replace(
    /<meta name="twitter:description"[^>]*\/>/,
    `<meta name="twitter:description" content="${escHtml(description)}" />`,
  );
  html = html.replace(
    /<meta name="twitter:image"[^>]*\/>/,
    `<meta name="twitter:image" content="${escHtml(image)}" />`,
  );
  html = html.replace(
    /<meta name="description"[^>]*\/>/,
    `<meta name="description" content="${escHtml(description)}" />`,
  );

  // Write to dist/beta/trait/{traitId}/index.html
  const dir = resolve(DIST, 'beta', 'trait', traitId);
  mkdirSync(dir, { recursive: true });
  writeFileSync(resolve(dir, 'index.html'), html);
  count++;
}

console.log(`✓ Generated ${count} trait OG pages`);

/** @param {string} s */
function escHtml(s) {
  return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}
