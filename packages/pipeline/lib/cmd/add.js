/**
 * `pnpm traits add <id>` — Add a trait and fetch its PGS metadata.
 * Handles comma-separated IDs for batch adds.
 */
import pgsApi from '../pgs-api-client.js';
import { shouldExcludePGS } from '../pgs-filter.js';
import * as traitDB from '../trait-db.js';
import * as pgsDB from '../pgs-db.js';

/**
 * @param {string} input - Trait ID or comma-separated IDs
 */
export async function addTrait(input) {
  if (!input) {
    console.error('Usage: pnpm traits add <trait_id>');
    return;
  }

  const ids = input.split(',').map(s => s.trim()).filter(Boolean);
  const existing = traitDB.getExistingTraitIds();

  for (const id of ids) {
    console.log(`\n--- Processing: ${id} ---`);
    await processSingleTrait(id, existing);
  }
}

/**
 *
 */
async function processSingleTrait(traitId, existingIds) {
  if (existingIds.has(traitId)) {
    console.log(`⚠ ${traitId} already exists — skipping`);
    return;
  }

  const traitInfo = await pgsApi.getTraitInfo(traitId).catch(() => null);
  if (!traitInfo || !traitInfo.label) {
    console.log(`✗ Could not find trait: ${traitId}`);
    return;
  }

  const pgsIds = [
    ...(traitInfo.associated_pgs_ids || []),
    ...(traitInfo.child_associated_pgs_ids || []),
  ];
  const uniquePgs = [...new Set(pgsIds)];
  console.log(`  ${traitInfo.label} — ${uniquePgs.length} PGS scores`);

  if (uniquePgs.length === 0) {
    console.log(`  ✗ No PGS scores available`);
    return;
  }

  const included = [];
  const excluded = [];

  for (const pgsId of uniquePgs) {
    try {
      const scoreData = await pgsApi.getScore(pgsId);
      const result = await shouldExcludePGS(pgsId, scoreData);

      if (result.exclude) {
        excluded.push({ pgs_id: pgsId, reason: result.reason });
        continue;
      }

      included.push({
        id: pgsId,
        weight_type: scoreData.weight_type,
        method: scoreData.method_name,
        variants_number: scoreData.variants_number,
        performance_weight: result.performance_weight,
        performance_metrics: result.performance_metrics,
      });
    } catch (err) {
      console.log(`  ⚠ ${pgsId}: ${err.message}`);
    }
  }

  if (included.length === 0) {
    console.log(`  ✗ No valid PGS scores after filtering`);
    return;
  }

  const totalVariants = included.reduce((s, p) => s + (p.variants_number || 0), 0);

  traitDB.upsertTrait(traitId, {
    name: traitInfo.label,
    description: traitInfo.description || null,
    categories: (traitInfo.trait_categories || []).join(','),
    expected_variants: totalVariants,
  });

  for (const pgs of included) {
    pgsDB.upsertPGS(pgs.id, pgs);
    if (pgs.performance_metrics) pgsDB.upsertPerformanceMetrics(pgs.id, pgs.performance_metrics);
    traitDB.addTraitPGS(traitId, pgs.id, pgs.performance_weight);
  }
  for (const ex of excluded) {
    traitDB.addExcludedPGS(traitId, ex.pgs_id, ex.reason, null, null);
  }

  existingIds.add(traitId);
  console.log(`  ✓ Added: ${included.length} PGS (${excluded.length} excluded), ${totalVariants.toLocaleString()} variants`);
}
