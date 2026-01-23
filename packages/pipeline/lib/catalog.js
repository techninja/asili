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

  for (const [mondoId, trait] of Object.entries(catalog.traits)) {
    // Normalize PGS IDs to objects with normalization params
    const normalizedPgs = trait.pgs_ids.map(pgs => {
      if (typeof pgs === 'string') {
        return { id: pgs, norm_mean: null, norm_sd: null };
      }
      return pgs;
    });
    
    configs[mondoId] = {
      pgs_ids: normalizedPgs,
      name: trait.title,
      mondo_id: mondoId,
      expected_variants: trait.expected_variants,
      description: trait.description || '',
      weight: 1.0
    };
  }

  return configs;
}
