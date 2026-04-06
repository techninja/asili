/**
 * `pnpm traits fresh` — Delete the trait database and start over.
 */
import { unlinkSync } from 'fs';
import prompts from 'prompts';
import { closeDb, DB_PATH } from '../shared-db.js';

/**
 *
 */
export async function freshStart() {
  const { confirm } = await prompts({
    type: 'confirm',
    name: 'confirm',
    message: 'This will delete ALL traits from the database. Are you sure?',
    initial: false,
  });

  if (!confirm) return;

  closeDb();
  for (const suffix of ['', '-wal', '-shm']) {
    try {
      unlinkSync(DB_PATH + suffix);
    } catch { /* ignore */ }
  }

  console.log('✓ Database removed — will be recreated on next run');
}
