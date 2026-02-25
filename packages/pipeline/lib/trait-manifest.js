import { upsertPGS, upsertPerformanceMetrics } from './pgs-db.js';
import { upsertTrait, deleteTrait } from './trait-db.js';
import { getConnection, closeConnection } from './shared-db.js';

/**
 * Unified trait manifest interface for pipeline, manage-traits, and calc server
 * Uses normalized trait_manifest.db schema
 */

export async function updateTraitInManifest(traitId, traitData) {
  // Extract PGS metadata and save separately
  const pgsMetadata = traitData.pgs_metadata || {};
  
  // Save PGS metadata to pgs_scores table
  for (const [pgsId, metadata] of Object.entries(pgsMetadata)) {
    await upsertPGS(pgsId, {
      weight_type: metadata.weight_type,
      method: metadata.method_name,
      norm_mean: metadata.norm_mean,
      norm_sd: metadata.norm_sd,
      variants_count: metadata.variants_count
    });
  }

  // Save trait to traits table
  await upsertTrait(traitId, {
    name: traitData.name,
    description: traitData.description,
    categories: JSON.stringify(traitData.categories || []),
    canonical_uri: traitData.canonical_uri,
    expected_variants: traitData.expected_variants || traitData.variant_count || 0,
    estimated_unique_variants: traitData.actual_variants || traitData.variant_count || 0
  });

  // Note: trait_pgs associations are managed by manage-traits.js
  // Note: pgs_performance metrics are managed by pgs-db.js during PGS metadata collection
}

export async function getTraitFromManifest(traitId) {
  const conn = await getConnection();
  return new Promise((resolve, reject) => {
    conn.all('SELECT * FROM traits WHERE trait_id = ?', [traitId], (err, rows) => {
      if (err) reject(err);
      else resolve(rows[0]);
    });
  });
}

export async function removeTraitFromManifest(traitId) {
  await deleteTrait(traitId);
}

export async function closeManifestConnection() {
  closeConnection();
}
