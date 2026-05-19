/**
 * `pnpm traits seed` — Fetch all traits from PGS Catalog API into DB.
 * Only adds traits that have at least one associated PGS score.
 */
import pgsApi from '../pgs-api-client.js';
import { upsertTrait, getExistingTraitIds } from '../trait-db.js';

/**
 *
 */
export async function seedTraits() {
  console.log('\n=== Seed Traits from PGS Catalog API ===\n');
  console.log('Fetching all traits from PGS Catalog...');

  const apiTraits = await pgsApi.getAllTraits();
  console.log(`✓ Fetched ${apiTraits.length} traits from API`);

  const existing = getExistingTraitIds();
  let added = 0;
  let updated = 0;

  for (const trait of apiTraits) {
    const hasPGS =
      trait.associated_pgs_ids?.length > 0 ||
      trait.child_associated_pgs_ids?.length > 0;
    if (!hasPGS) continue;

    const isNew = !existing.has(trait.id);
    upsertTrait(trait.id, {
      name: trait.label,
      description: trait.description || null,
      categories: (trait.trait_categories || []).join(','),
    });
    if (isNew) added++;
    else updated++;
  }

  console.log(`\n✓ Seed complete: ${added} added, ${updated} updated`);
}
