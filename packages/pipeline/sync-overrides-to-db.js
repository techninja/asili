#!/usr/bin/env node

import chalk from 'chalk';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';
import { getAllTraits, upsertTrait } from './lib/trait-db.js';
import { closeConnection } from './lib/shared-db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OVERRIDES_PATH = path.join(__dirname, 'trait_overrides.json');

function calculateMetadataHash(override) {
  const metadata = {
    unit: override.unit || null,
    emoji: override.emoji || null,
    trait_type: override.trait_type || null,
    editorial_name: override.editorial_name || null,
    editorial_description: override.editorial_description || null,
    phenotype_mean: override.phenotype_mean || null,
    phenotype_sd: override.phenotype_sd || null,
    reference_population: override.reference_population || null
  };
  const str = JSON.stringify(metadata, Object.keys(metadata).sort());
  return crypto.createHash('sha256').update(str).digest('hex');
}

async function syncOverridesToDB() {
  console.log(chalk.cyan('\n=== Sync trait_overrides.json to Database ===\n'));
  
  // Load overrides
  const overridesData = await fs.readFile(OVERRIDES_PATH, 'utf8');
  const overrides = JSON.parse(overridesData);
  
  // Get all traits from DB
  const dbTraits = await getAllTraits();
  const dbTraitMap = Object.fromEntries(dbTraits.map(t => [t.trait_id, t]));
  
  let updated = 0;
  let unchanged = 0;
  let notInDb = 0;
  
  console.log(chalk.blue(`Checking ${Object.keys(overrides).length} traits in overrides...`));
  
  for (const [traitId, override] of Object.entries(overrides)) {
    const dbTrait = dbTraitMap[traitId];
    
    if (!dbTrait) {
      notInDb++;
      continue;
    }
    
    // Calculate hash of override metadata
    const overrideHash = calculateMetadataHash(override);
    
    // Check if hash differs
    if (overrideHash !== dbTrait.metadata_hash) {
      await upsertTrait(traitId, {
        name: dbTrait.name,
        description: dbTrait.description,
        categories: dbTrait.categories,
        expected_variants: dbTrait.expected_variants,
        estimated_unique_variants: dbTrait.estimated_unique_variants
      });
      
      console.log(chalk.green(`✓ Updated ${override.editorial_name || dbTrait.name} (${traitId})`));
      updated++;
    } else {
      unchanged++;
    }
  }
  
  console.log(chalk.blue(`\n📊 Summary:`));
  console.log(chalk.green(`  Updated: ${updated}`));
  console.log(chalk.gray(`  Unchanged: ${unchanged}`));
  if (notInDb > 0) {
    console.log(chalk.yellow(`  Not in DB: ${notInDb} (run 'pnpm traits add' to add them)`));
  }
  
  if (updated > 0) {
    console.log(chalk.yellow('\n💡 Run pipeline to regenerate trait_manifest.json'));
  }
  
  closeConnection();
}

syncOverridesToDB().catch(console.error);
