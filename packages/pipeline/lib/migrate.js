/**
 * Run SQL migration files against the shared database.
 * Idempotent — safe to call multiple times.
 */
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { getDb } from './shared-db.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = join(__dirname, '..', 'migrations');
const MIGRATION_FILES = ['000_create_traits.sql'];

let migrated = false;

/**
 *
 */
export function runMigrations() {
  if (migrated) return;
  const db = getDb();

  for (const file of MIGRATION_FILES) {
    const sql = readFileSync(join(MIGRATIONS_DIR, file), 'utf8');
    const statements = sql
      .split('\n')
      .filter(line => !line.trim().startsWith('--'))
      .join('\n')
      .split(';')
      .map(s => s.trim())
      .filter(s => s.length > 0);

    for (const stmt of statements) db.exec(stmt);
  }

  migrated = true;
}
