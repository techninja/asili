#!/usr/bin/env node

/**
 * Post-install setup — vendors dependencies and builds icon sprite.
 * @module scripts/setup
 */

import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));

await import(resolve(ROOT, 'scripts/vendor-deps.js'));
await import(resolve(ROOT, 'scripts/build-icons.js'));
