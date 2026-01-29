import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export async function loadTraitCatalog() {
  const catalogPath = path.join(__dirname, '../trait_catalog.json');
  const data = await fs.readFile(catalogPath, 'utf8');
  return JSON.parse(data);
}

export function getTraitConfigs(catalog) {
  const configs = {};

  for (const [traitId, trait] of Object.entries(catalog.traits)) {
    // Extract PGS IDs (handle both string and object formats)
    const pgsIds = trait.pgs_ids.map(pgs => 
      typeof pgs === 'string' ? pgs : pgs.id
    );
    
    // Build normalization params map
    const normalizationParams = {};
    trait.pgs_ids.forEach(pgs => {
      if (typeof pgs === 'object' && pgs.id) {
        normalizationParams[pgs.id] = {
          norm_mean: pgs.norm_mean || 0,
          norm_sd: pgs.norm_sd || null,
          weight_type: pgs.weight_type,
          method: pgs.method
        };
      }
    });
    
    configs[traitId] = {
      pgs_ids: pgsIds,
      normalization_params: normalizationParams,
      name: trait.title,
      trait_id: traitId,
      expected_variants: trait.expected_variants,
      description: trait.description || '',
      weight: 1.0
    };
  }

  return configs;
}
