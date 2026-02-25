#!/usr/bin/env node
// Migration script: trait_catalog.json → DuckDB databases

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import chalk from 'chalk';
import pgsDB from './lib/pgs-db.js';
import traitDB from './lib/trait-db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CATALOG_PATH = path.join(__dirname, 'trait_catalog.json');
const NEW_CATALOG_PATH = path.join(__dirname, 'trait_catalog_v2.json');

async function migrate() {
  console.log(chalk.bold.cyan('\n🔄 Migrating trait catalog to database structure\n'));

  // Read existing catalog
  const catalogData = await fs.readFile(CATALOG_PATH, 'utf8');
  const catalog = JSON.parse(catalogData);

  const stats = {
    traits: 0,
    pgs_scores: 0,
    excluded: 0,
    performance_metrics: 0
  };

  // Create simplified catalog
  const simplifiedCatalog = { traits: {} };

  for (const [traitId, trait] of Object.entries(catalog.traits)) {
    console.log(chalk.blue(`Processing ${trait.title} (${traitId})...`));

    // Add to simplified catalog (just ID and description)
    simplifiedCatalog.traits[traitId] = {
      trait_id: traitId,
      title: trait.title,
      description: trait.description || undefined
    };

    // Add trait to database
    traitDB.upsertTrait(traitId, {
      title: trait.title,
      description: trait.description,
      canonical_uri: trait.canonical_uri,
      expected_variants: trait.expected_variants,
      estimated_unique_variants: trait.estimated_unique_variants
    });
    stats.traits++;

    // Process PGS scores
    for (const pgs of trait.pgs_ids || []) {
      // Add to PGS metadata DB
      pgsDB.upsertPGS(pgs.id, {
        weight_type: pgs.weight_type,
        method: pgs.method,
        norm_mean: pgs.norm_mean,
        norm_sd: pgs.norm_sd,
        variants_count: null // Not stored in old format
      });
      stats.pgs_scores++;

      // Add performance metrics if present
      if (pgs.performance_metrics?.all_metrics) {
        pgsDB.upsertPerformanceMetrics(pgs.id, pgs.performance_metrics);
        stats.performance_metrics += pgs.performance_metrics.all_metrics.length;
      }

      // Link PGS to trait
      traitDB.addTraitPGS(traitId, pgs.id, pgs.performance_weight || 0.5);
    }

    // Process excluded PGS
    for (const excluded of trait.excluded_pgs || []) {
      traitDB.addExcludedPGS(
        traitId,
        excluded.pgs_id,
        excluded.reason,
        excluded.method,
        excluded.weight_type
      );
      stats.excluded++;
    }

    console.log(chalk.green(`  ✓ ${trait.pgs_ids?.length || 0} PGS, ${trait.excluded_pgs?.length || 0} excluded`));
  }

  // Write simplified catalog
  await fs.writeFile(NEW_CATALOG_PATH, JSON.stringify(simplifiedCatalog, null, 2));

  console.log(chalk.bold.green('\n✅ Migration complete!\n'));
  console.log(chalk.blue('Statistics:'));
  console.log(`  Traits: ${stats.traits}`);
  console.log(`  PGS Scores: ${stats.pgs_scores}`);
  console.log(`  Excluded PGS: ${stats.excluded}`);
  console.log(`  Performance Metrics: ${stats.performance_metrics}`);
  
  // Calculate size reduction
  const oldSize = (await fs.stat(CATALOG_PATH)).size;
  const newSize = (await fs.stat(NEW_CATALOG_PATH)).size;
  const reduction = ((1 - newSize / oldSize) * 100).toFixed(1);
  
  console.log(chalk.yellow(`\nFile size: ${(oldSize / 1024).toFixed(1)}KB → ${(newSize / 1024).toFixed(1)}KB (${reduction}% reduction)`));
  console.log(chalk.gray(`\nOld catalog: ${CATALOG_PATH}`));
  console.log(chalk.gray(`New catalog: ${NEW_CATALOG_PATH}`));
  console.log(chalk.gray(`PGS DB: ${path.join(__dirname, 'data/pgs_metadata.db')}`));
  console.log(chalk.gray(`Trait DB: ${path.join(__dirname, 'data/trait_metadata.db')}`));
}

migrate().catch(console.error).finally(() => {
  pgsDB.close();
  traitDB.close();
});
