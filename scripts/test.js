#!/usr/bin/env node

/**
 * Test runner — unified entry point for all test types.
 *
 * Usage:
 *   pnpm test          — interactive prompt (or runs all in CI)
 *   pnpm test node     — unit tests (Node test runner)
 *   pnpm test browser  — component tests (Web Test Runner)
 *   pnpm test e2e      — E2E tests (Playwright)
 *   pnpm test all      — runs all sequentially
 *
 * Extra args are passed through:
 *   pnpm test e2e --headed
 *   pnpm test e2e --grep "settings"
 *
 * @module scripts/test
 */

import { execSync, spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readdirSync, existsSync } from 'node:fs';
import readline from 'node:readline';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const args = process.argv.slice(2);
const command = args[0];
const extra = args.slice(1).join(' ');

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

function runNode() {
  const componentDir = resolve(ROOT, 'src/components');
  const allTests = findTests(resolve(ROOT, 'src')).concat(findTests(resolve(ROOT, 'packages')));
  const nodeTests = allTests.filter((f) => !f.startsWith(componentDir));
  if (!nodeTests.length) { console.log('No node tests found.'); return true; }
  console.log(`\n  ▶ Node tests (${nodeTests.length} files)\n`);
  try {
    execSync(`node --test ${nodeTests.join(' ')} ${extra}`, { cwd: ROOT, stdio: 'inherit' });
    return true;
  } catch { return false; }
}

function runBrowser() {
  const componentDir = resolve(ROOT, 'src/components');
  const browserTests = findTests(componentDir);
  if (!browserTests.length) { console.log('No browser tests found.'); return true; }
  console.log(`\n  ▶ Browser tests (${browserTests.length} files)\n`);
  try {
    execSync(`npx web-test-runner --config .configs/web-test-runner.config.js ${extra}`, {
      cwd: ROOT, stdio: 'inherit',
    });
    return true;
  } catch { return false; }
}

function runE2E() {
  console.log(`\n  ▶ E2E tests (Playwright)\n`);
  try {
    execSync(`npx playwright test ${extra}`, { cwd: ROOT, stdio: 'inherit' });
    return true;
  } catch { return false; }
}

async function prompt() {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  console.log('\n  Which tests to run?\n');
  console.log('    1) node     — unit tests');
  console.log('    2) browser  — component tests');
  console.log('    3) e2e      — end-to-end (Playwright)');
  console.log('    4) all      — everything\n');
  const answer = await new Promise(r => rl.question('  Choice [4]: ', r));
  rl.close();
  const choice = answer.trim() || '4';
  const map = { '1': 'node', '2': 'browser', '3': 'e2e', '4': 'all', node: 'node', browser: 'browser', e2e: 'e2e', all: 'all' };
  return map[choice] || 'all';
}

async function main() {
  let cmd = command;

  // In CI, default to 'all'. Interactively, prompt.
  if (!cmd) {
    if (process.env.CI) cmd = 'all';
    else cmd = await prompt();
  }

  let passed = true;
  if (cmd === 'node' || cmd === 'all') { if (!runNode()) passed = false; }
  if (cmd === 'browser' || cmd === 'all') { if (!runBrowser()) passed = false; }
  if (cmd === 'e2e' || cmd === 'all') { if (!runE2E()) passed = false; }

  if (!['node', 'browser', 'e2e', 'all'].includes(cmd)) {
    console.error(`Unknown test command: ${cmd}`);
    console.log('Usage: pnpm test [node|browser|e2e|all]');
    process.exit(1);
  }

  process.exit(passed ? 0 : 1);
}

main();
