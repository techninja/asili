#!/usr/bin/env node
import { readFileSync, writeFileSync, readdirSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const REFSTATS_DIR = path.join(dirname(__dirname), 'data_out', 'refstats');
const TRAIT_OVERRIDES_PATH = path.join(dirname(__dirname), 'packages', 'pipeline', 'trait_overrides.json');

function mergeRefstats() {
  console.log('📊 Merging empirical reference statistics into trait overrides\n');
  
  // Load trait overrides
  const overrides = JSON.parse(readFileSync(TRAIT_OVERRIDES_PATH, 'utf8'));
  
  // Find all refstats files
  const refstatsFiles = readdirSync(REFSTATS_DIR)
    .filter(f => f.endsWith('_refstats.json'))
    .filter(f => !f.includes('checkpoint'));
  
  console.log(`Found ${refstatsFiles.length} reference statistics files\n`);
  
  let updated = 0;
  let notFound = 0;
  
  for (const file of refstatsFiles) {
    const refstats = JSON.parse(readFileSync(path.join(REFSTATS_DIR, file), 'utf8'));
    const traitId = refstats.traitId;
    
    if (overrides[traitId]) {
      overrides[traitId].norm_mean = refstats.refMean;
      overrides[traitId].norm_sd = refstats.refStd;
      overrides[traitId].norm_coverage = refstats.coverage;
      overrides[traitId].norm_matched_variants = refstats.processedVariants;
      overrides[traitId].norm_source = 'gnomad_v4.1';
      
      console.log(`✓ ${traitId}: μ=${refstats.refMean.toFixed(4)}, σ=${refstats.refStd.toFixed(4)} (${(refstats.coverage * 100).toFixed(1)}% coverage)`);
      updated++;
    } else {
      // Create new override entry
      overrides[traitId] = {
        norm_mean: refstats.refMean,
        norm_sd: refstats.refStd,
        norm_coverage: refstats.coverage,
        norm_matched_variants: refstats.processedVariants,
        norm_source: 'gnomad_v4.1'
      };
      console.log(`✓ ${traitId}: μ=${refstats.refMean.toFixed(4)}, σ=${refstats.refStd.toFixed(4)} (${(refstats.coverage * 100).toFixed(1)}% coverage) [NEW]`);
      updated++;
    }
  }
  
  // Write updated overrides
  writeFileSync(TRAIT_OVERRIDES_PATH, JSON.stringify(overrides, null, 2));
  
  console.log(`\n${'='.repeat(60)}`);
  console.log('✅ SUMMARY');
  console.log('='.repeat(60));
  console.log(`Updated: ${updated} traits`);
  console.log(`\n💾 Saved: ${TRAIT_OVERRIDES_PATH}\n`);
}

mergeRefstats();
