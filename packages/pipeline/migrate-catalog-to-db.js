#!/usr/bin/env node
// Migrate existing trait_catalog.json to database
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import * as pgsDB from './lib/pgs-db.js';
import * as traitDB from './lib/trait-db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CATALOG_PATH = path.join(__dirname, 'trait_catalog.json');

async function migrate() {
  const data = await fs.readFile(CATALOG_PATH, 'utf8');
  const catalog = JSON.parse(data);
  
  for (const [traitId, trait] of Object.entries(catalog.traits)) {
    if (!trait.pgs_ids) continue;
    
    // Insert trait metadata
    await traitDB.upsertTrait(traitId, {
      name: trait.title,
      description: trait.description || null,
      categories: '',
      expected_variants: trait.expected_variants || null,
      estimated_unique_variants: null
    });
    
    for (const pgs of trait.pgs_ids) {
      const pgsData = { 
        weight_type: pgs.weight_type || null, 
        method: pgs.method || null, 
        norm_mean: pgs.norm_mean ?? null, 
        norm_sd: pgs.norm_sd ?? null, 
        variants_count: null 
      };
      console.log(`Inserting ${pgs.id}`);
      await pgsDB.upsertPGS(pgs.id, pgsData);
      if (pgs.performance_metrics) await pgsDB.upsertPerformanceMetrics(pgs.id, pgs.performance_metrics);
      await traitDB.addTraitPGS(traitId, pgs.id, pgs.performance_weight || 0.5);
    }
    if (trait.excluded_pgs) {
      for (const ex of trait.excluded_pgs) {
        await traitDB.addExcludedPGS(traitId, ex.pgs_id, ex.reason, ex.method, ex.weight_type);
      }
    }
  }
  console.log('✓ Migration complete');
}

migrate().catch(err => { console.error(err); process.exit(1); });
