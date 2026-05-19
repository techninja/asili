/**
 * `pnpm traits list` — Display all traits in the database.
 */
import { getAllTraits, getTraitPGS } from '../trait-db.js';

/**
 *
 */
export function listTraits() {
  const traits = getAllTraits();
  console.log(`\n=== Current Traits (${traits.length}) ===\n`);

  if (traits.length === 0) {
    console.log('No traits in database. Run: pnpm traits seed');
    return;
  }

  for (const t of traits) {
    const pgs = getTraitPGS(t.trait_id);
    const name = t.editorial_name || t.name;
    const emoji = t.emoji || '  ';
    const pgsInfo = pgs.length > 0 ? `${pgs.length} PGS` : 'no PGS';
    console.log(`${emoji} ${name} (${t.trait_id}) — ${pgsInfo}`);
  }
}
