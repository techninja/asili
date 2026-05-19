/**
 * `pnpm traits refresh [id]` — Fetch/update PGS data for traits.
 * No arg: refresh all tier traits missing PGS data.
 * With arg: force-refresh specific trait(s).
 */
import { loadAllowlist } from '../catalog.js';
import * as traitDB from '../trait-db.js';
import { addTrait } from './add.js';

/**
 * @param {string | null} traitFilter - Comma-separated trait IDs, or null for all
 */
export async function refreshTraits(traitFilter) {
  const tier = process.env.ASILI_TIER || 'tier1_public';

  if (traitFilter) {
    const ids = traitFilter.split(',').map(s => s.trim()).filter(Boolean);
    console.log(`\n=== Force Refresh ${ids.length} Trait(s) ===\n`);
    for (const id of ids) traitDB.clearTraitPGS(id);
    // Re-add clears existing flag so processSingleTrait will re-process
    const existing = traitDB.getExistingTraitIds();
    for (const id of ids) {
      existing.delete(id);
      await addTrait(id);
    }
    return;
  }

  console.log(`\n=== Refresh Trait Data (tier: ${tier}) ===\n`);

  const dbTraits = traitDB.getAllTraits();
  if (dbTraits.length === 0) {
    console.log('No traits in database. Run: pnpm traits seed');
    return;
  }

  const allowlist = loadAllowlist(tier);
  const target = allowlist
    ? dbTraits.filter(t => allowlist.has(t.trait_id))
    : dbTraits;

  const existing = traitDB.getExistingTraitIds();
  const needsRefresh = target.filter(t => !existing.has(t.trait_id));

  console.log(`${target.length} traits in tier, ${existing.size} have PGS data, ${needsRefresh.length} need processing\n`);

  if (needsRefresh.length === 0) {
    console.log('✓ All tier traits up to date');
    return;
  }

  let ok = 0;
  let errors = 0;
  for (const trait of needsRefresh) {
    console.log(`[${ok + errors + 1}/${needsRefresh.length}] ${trait.name} (${trait.trait_id})`);
    try {
      await addTrait(trait.trait_id);
      ok++;
    } catch (err) {
      console.log(`  ✗ ${err.message}`);
      errors++;
    }
  }

  console.log(`\n✓ Refresh complete: ${ok} succeeded, ${errors} errors`);
}
