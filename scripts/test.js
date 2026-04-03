#!/usr/bin/env node

/**
 * Test runner — runs node tests directly, browser tests via web-test-runner.
 * Browser tests live in src/components/. Everything else runs in Node.
 * @module scripts/test
 */

import { execSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readdirSync, existsSync } from 'node:fs';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));

/** @param {string} dir @returns {string[]} */
function findTests(dir) {
  const results = [];
  if (!existsSync(dir)) return results;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = resolve(dir, entry.name);
    if (entry.name === 'node_modules' || entry.name === 'vendor') continue;
    if (entry.isDirectory()) results.push(...findTests(full));
    else if (entry.name.endsWith('.test.js')) results.push(full);
  }
  return results;
}

const componentDir = resolve(ROOT, 'src/components');
const allTests = findTests(ROOT);
const nodeTests = allTests.filter((f) => !f.startsWith(componentDir));
const browserTests = allTests.filter((f) => f.startsWith(componentDir));
let failed = false;

if (nodeTests.length > 0) {
  console.log(`Running ${nodeTests.length} node test(s)...\n`);
  try {
    execSync(`node --test ${nodeTests.join(' ')}`, { cwd: ROOT, stdio: 'inherit' });
  } catch {
    failed = true;
  }
}

if (browserTests.length > 0) {
  console.log(`\nRunning ${browserTests.length} browser test(s)...\n`);
  try {
    execSync('npx web-test-runner --config .configs/web-test-runner.config.js', {
      cwd: ROOT,
      stdio: 'inherit',
    });
  } catch {
    failed = true;
  }
}

if (allTests.length === 0) console.log('No test files found.');
if (failed) process.exit(1);
