/**
 * `pnpm traits sync` — Sync editorial overrides to database.
 * Re-reads trait_overrides.json and updates any traits whose metadata hash changed.
 */
import { getAllTraits, upsertTrait, reloadOverrides } from '../trait-db.js';

/**
 *
 */
export function syncOverrides() {
  console.log('\n=== Sync Overrides to Database ===\n');

  reloadOverrides();
  const traits = getAllTraits();

  if (traits.length === 0) {
    console.log('No traits in database. Run: pnpm traits seed');
    return;
  }

  let updated = 0;
  for (const t of traits) {
    const before = t.metadata_hash;
    upsertTrait(t.trait_id, {
      name: t.name,
      description: t.description,
      categories: t.categories,
      expected_variants: t.expected_variants,
      estimated_unique_variants: t.estimated_unique_variants,
    });

    // Re-read to check if hash changed
    const after = getAllTraits().find(r => r.trait_id === t.trait_id);
    if (after?.metadata_hash !== before) {
      console.log(`✓ Updated ${after?.editorial_name || t.name} (${t.trait_id})`);
      updated++;
    }
  }

  console.log(`\n✓ Sync complete: ${updated} updated, ${traits.length - updated} unchanged`);
}
