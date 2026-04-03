#!/usr/bin/env node

/**
 * Copies third-party ES module sources into src/vendor/ so the browser
 * can load them directly via import map. Runs on `npm postinstall`.
 */

import { cpSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const VENDOR_DIR = resolve(ROOT, 'src/vendor');

/** @type {{ name: string, src: string }[]} */
const DEPS = [{ name: 'hybrids', src: 'node_modules/hybrids/src' }];

mkdirSync(VENDOR_DIR, { recursive: true });

for (const dep of DEPS) {
  const src = resolve(ROOT, dep.src);
  const dest = resolve(VENDOR_DIR, dep.name);
  cpSync(src, dest, { recursive: true });
  console.log(`✓ Vendored: ${dep.name} → src/vendor/${dep.name}/`);
}
