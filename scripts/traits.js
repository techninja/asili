#!/usr/bin/env node

/**
 * pnpm traits — Trait management CLI.
 * Subcommands: list, seed, add <id>, refresh [id], sync, fresh
 * No args → interactive menu.
 */
import '../packages/pipeline/lib/env.js';
import { run } from '../packages/pipeline/lib/traits-cli.js';

run(process.argv.slice(2)).catch((err) => {
  console.error(err.message);
  process.exit(1);
});
