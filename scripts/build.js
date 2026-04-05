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
import { execSync, execFileSync } from 'node:child_process';
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

// Copy src/ as the root
console.log('→ Copying src/ → dist/');
cpSync(resolve(ROOT, 'src'), DIST, { recursive: true });

// Inject deploy hash into index.html for cache busting
console.log(`→ Injecting deploy hash: ${HASH}`);
const indexPath = resolve(DIST, 'index.html');
let html = readFileSync(indexPath, 'utf-8');
html = html.replace(/(\.css|\.js)"/g, `$1?v=${HASH}"`);
writeFileSync(indexPath, html);

// SPA fallback — copy index.html to 404.html for client-side routing
console.log('→ Creating 404.html for SPA routing');
cpSync(resolve(DIST, 'index.html'), resolve(DIST, '404.html'));

console.log('✓ Build complete → dist/');
