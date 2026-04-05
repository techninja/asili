#!/usr/bin/env node

/**
 * Build script for Cloudflare Pages deployment.
 * Copies src/ into a dist/ directory.
 * Runs icon generation first.
 */

import { cpSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const DIST = resolve(ROOT, 'dist');

// Clean
if (existsSync(DIST)) rmSync(DIST, { recursive: true });
mkdirSync(DIST, { recursive: true });

// Build icons
console.log('→ Building icons...');
execSync('node scripts/build-icons.js', { cwd: ROOT, stdio: 'inherit' });

// Copy src/ as the root
console.log('→ Copying src/ → dist/');
cpSync(resolve(ROOT, 'src'), DIST, { recursive: true });

// SPA fallback — copy index.html to 404.html for client-side routing
console.log('→ Creating 404.html for SPA routing');
cpSync(resolve(DIST, 'index.html'), resolve(DIST, '404.html'));

console.log('✓ Build complete → dist/');
