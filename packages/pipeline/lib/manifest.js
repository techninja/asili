import { loadTraitCatalog } from './catalog.js';
import { upsertTrait, exportManifests } from './manifest-db.js';
import pgsApiClient from '../pgs-api-client.js';

// Category mapping for better organization
const CATEGORY_MAPPING = {
  Cancer: 'Cancer',
  'Neurological disorder': 'Neurological Disorders',
  'Cardiovascular disease': 'Cardiovascular Disease',
  'Metabolic disorder': 'Metabolic Disorders',
  'Immune system disorder': 'Immune System Disorders',
  'Mental health disorder': 'Mental Health',
  'Digestive system disorder': 'Digestive System Disorders'
};

async function getTraitCategories(mondoId) {
  try {
    const traitInfo = await pgsApiClient.getTraitInfo(mondoId);
    if (traitInfo?.trait_categories?.length > 0) {
      return traitInfo.trait_categories.map(
        cat => CATEGORY_MAPPING[cat] || cat
      );
    }
  } catch (error) {
    // Silently fall back to default category
  }

  return ['Other Conditions']; // Only use as fallback when no other categories exist
}

export async function updateOutputManifest(updatedData) {
  const catalog = await loadTraitCatalog();
  const updates = [];

  for (const [mondoId, data] of Object.entries(updatedData)) {
    const traitInfo = catalog.traits[mondoId];
    if (!traitInfo) continue;

    updates.push({
      mondoId,
      data: {
        name: traitInfo.title,
        description: traitInfo.description || null,
        categories: await getTraitCategories(mondoId),
        variant_count: data.variant_count,
        file_path: data.fileName || `${mondoId.replace(':', '_')}_hg38.parquet`,
        pgs_metadata: data.pgs_metadata || {},
        source_hashes: data.source_hashes || {},
        last_updated: data.timestamp,
        actual_variants: data.variant_count || 0,
        file_size_mb: data.file_size_mb || 0,
        last_processed: data.timestamp,
        expected_variants: data.expected_variants || data.variant_count || 0,
        weight: data.weight || 1.0,
        pgs_ids: data.pgsIds || traitInfo.pgs_ids || [],
        mondo_id: mondoId,
        last_validated: data.timestamp,
        canonical_uri: traitInfo.canonical_uri || null,
        excluded_pgs: traitInfo.excluded_pgs || []
      }
    });
  }

  // Batch upsert all traits at once
  if (updates.length > 0) {
    await Promise.all(updates.map(({ mondoId, data }) => upsertTrait(mondoId, data)));
  }
}

export async function finalizeManifest() {
  await exportManifests();
}
