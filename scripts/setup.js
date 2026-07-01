#!/usr/bin/env node

/**
 * Post-install setup — vendors dependencies and builds icon sprite.
 * @module scripts/setup
 */

import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync, copyFileSync } from 'node:fs';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));

// Create .env.local from example if missing (prevents --env-file error on dev)
const envLocal = resolve(ROOT, '.env.local');
if (!existsSync(envLocal)) {
  copyFileSync(resolve(ROOT, '.env'), envLocal);
  console.log('. postinstall: ✓ Created .env.local from .env');
}

await import(resolve(ROOT, 'scripts/vendor-deps.js'));
await import(resolve(ROOT, 'scripts/build-icons.js'));
