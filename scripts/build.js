#!/usr/bin/env node

/**
 * Build script for Cloudflare Pages deployment.
 * Copies src/ into a dist/ directory.
 * Runs icon generation first.
 * Injects a deploy hash into asset links for cache busting.
 */

import { cpSync, mkdirSync, rmSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const DIST = resolve(ROOT, 'dist');

// Generate a short deploy hash
const HASH = randomBytes(4).toString('hex');

// Clean
if (existsSync(DIST)) rmSync(DIST, { recursive: true });
mkdirSync(DIST, { recursive: true });

// Build icons
console.log('→ Building icons...');
execSync('node scripts/build-icons.js', { cwd: ROOT, stdio: 'inherit' });

// Copy src/ as the root (skip data/ — served from R2)
console.log('→ Copying src/ → dist/');
cpSync(resolve(ROOT, 'src'), DIST, {
  recursive: true,
  filter: (src) => !src.includes('/data/') && !src.endsWith('/data'),
});

// Copy packages/ for runtime imports
console.log('→ Copying packages/ → dist/packages/');
cpSync(resolve(ROOT, 'packages'), resolve(DIST, 'packages'), { recursive: true });

// Generate trait manifest for OG
console.log('→ Building trait manifest...');
try {
  execSync('node scripts/build-trait-manifest.js', { cwd: ROOT, stdio: 'inherit' });
} catch {
  console.warn('⚠ Trait manifest skipped (no source)');
}

// Generate per-trait OG pages for link previews
console.log('→ Generating OG metadata pages...');
try {
  const { buildOG } = await import('@techninja/clearstack/lib/build-og.js');
  buildOG({ projectDir: ROOT, outDir: 'dist', baseUrl: 'https://app.asili.dev' });
} catch (e) {
  console.warn('⚠ OG generation failed:', e.message);
}

// Generate per-trait OG images for social previews
console.log('→ Generating OG images...');
try {
  execSync('npx playwright install chromium', { cwd: ROOT, stdio: 'inherit' });
  const { buildOGImages } = await import('@techninja/clearstack/lib/build-og-images.js');
  await buildOGImages({ projectDir: ROOT, outDir: 'dist', siteName: 'Asili' });
} catch (e) {
  console.warn('⚠ OG image generation failed:', e.message);
}

// Inject version + cache-bust AFTER OG generation (which may rewrite index.html)
const VERSION = JSON.parse(readFileSync(resolve(ROOT, 'package.json'), 'utf-8')).version;
console.log(`→ Injecting deploy hash: ${HASH}, version: ${VERSION}`);
const indexPath = resolve(DIST, 'index.html');
let html = readFileSync(indexPath, 'utf-8');
html = html.replace(/(\.css|\.js)"/g, `$1?v=${HASH}"`);
html = html.replace(
  /<meta name="app-version" content="[^"]*" \/>/,
  `<meta name="app-version" content="${VERSION}" />`,
);
writeFileSync(indexPath, html);

console.log('→ Injecting modulepreload hints...');
const { buildModulePreload } = await import('@techninja/clearstack/lib/build-modulepreload.js');
buildModulePreload({ projectDir: ROOT, outDir: 'dist' });

// SPA fallback — copy index.html to 404.html after all mutations
console.log('→ Creating 404.html for SPA routing');
cpSync(resolve(DIST, 'index.html'), resolve(DIST, '404.html'));

console.log('✓ Build complete → dist/');
