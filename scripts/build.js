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

const IS_BETA = process.argv.includes('--beta') || process.env.DEPLOY_ENV === 'beta';
const BASE_URL = IS_BETA ? 'https://beta.asili.dev' : 'https://app.asili.dev';
const COMMIT_SHA = process.env.GITHUB_SHA || '';
const REPO = process.env.GITHUB_REPOSITORY || 'techninja/asili';
const COMMIT_URL = COMMIT_SHA ? `https://github.com/${REPO}/commit/${COMMIT_SHA}` : '';

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

// Fetch gene catalog for OG (local symlink won't exist in CI)
const GENE_CATALOG_PATH = resolve(ROOT, 'src/data/gene_catalog.json');
if (!existsSync(GENE_CATALOG_PATH)) {
  console.log('→ Fetching gene catalog from CDN...');
  try {
    const resp = await fetch('https://data.asili.dev/gene_catalog.json');
    if (resp.ok) {
      mkdirSync(resolve(ROOT, 'src/data'), { recursive: true });
      writeFileSync(GENE_CATALOG_PATH, await resp.text());
      console.log('  ✓ gene_catalog.json cached for OG generation');
    }
  } catch (e) {
    console.warn('⚠ Gene catalog fetch failed:', e.message);
  }
}

// Generate per-trait OG pages + sitemap for link previews (prod only)
if (!IS_BETA) {
  console.log('→ Generating OG metadata pages...');
  try {
    const { buildOG } = await import('@techninja/clearstack/lib/build-og.js');
    buildOG({ projectDir: ROOT, outDir: 'dist', baseUrl: BASE_URL });
    const { buildSitemap } = await import('@techninja/clearstack/lib/build-sitemap.js');
    buildSitemap({ projectDir: ROOT, outDir: 'dist', baseUrl: BASE_URL });
  } catch (e) {
    console.warn('⚠ OG generation failed:', e.message);
  }
}

// OG images are pre-generated locally and deployed to R2 via deploy-data.js.
// CI only needs the HTML pages (meta tags) for social crawlers.

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
if (COMMIT_URL) {
  html = html.replace(
    /<meta name="app-commit" content="[^"]*" \/>/,
    `<meta name="app-commit" content="${COMMIT_URL}" />`,
  );
}
writeFileSync(indexPath, html);

console.log('→ Injecting modulepreload hints...');
const { buildModulePreload } = await import('@techninja/clearstack/lib/build-modulepreload.js');
buildModulePreload({ projectDir: ROOT, outDir: 'dist' });

// Apply cache-bust hash to modulepreload hrefs (buildModulePreload runs after hash injection)
{
  let h = readFileSync(indexPath, 'utf-8');
  h = h.replace(/(rel="modulepreload" href="[^"]+\.js)"/g, `$1?v=${HASH}"`);
  writeFileSync(indexPath, h);
}

// SPA fallback — copy index.html to 404.html after all mutations
console.log('→ Creating 404.html for SPA routing');
cpSync(resolve(DIST, 'index.html'), resolve(DIST, '404.html'));

console.log('✓ Build complete → dist/');
