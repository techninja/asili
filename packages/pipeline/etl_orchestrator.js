#!/usr/bin/env node

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { loadTraitCatalog, getTraitConfigs } from './lib/catalog.js';
import { generateTraitPack } from './lib/processor.js';
import { closeManifestConnection } from './lib/trait-manifest.js';
import { exportTraitManifestJSON } from './lib/export-manifest.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function main() {
  console.log('🧬 Asili ETL Pipeline Starting...');
  console.log('=====================================');

  const startTime = Date.now();
  let processedCount = 0;
  let errorCount = 0;
  const errors = [];

  try {
    // Load trait catalog
    console.log('📋 Loading trait catalog...');
    const catalog = await loadTraitCatalog();
    const traitConfigs = await getTraitConfigs(catalog);

    console.log(`📊 Processing ${Object.keys(traitConfigs).length} traits`);
    console.log('');

    // Process traits - sort by variant count (largest first)
    const sortedTraits = Object.entries(traitConfigs).sort(
      ([, a], [, b]) => Number(b.expected_variants || 0) - Number(a.expected_variants || 0)
    );

    for (const [traitName, config] of sortedTraits) {
      const displayName = `${config.name || config.title || traitName} (${config.trait_id || traitName})`;
      const traitStartTime = Date.now();

      try {
        console.log(`🔄 Processing: ${displayName}`);
        const result = await generateTraitPack(traitName, config, {});
        
        if (!result.metadata_only) {
          console.log(
            `   ✅ Generated ${displayName} (${result.variant_count} variants, ${Math.round((Date.now() - traitStartTime) / 1000)}s)`
          );
        } else {
          console.log(
            `   ✅ Skipped ${displayName} - up to date (${Math.round((Date.now() - traitStartTime) / 1000)}s)`
          );
        }

        processedCount++;
        console.log('');
      } catch (error) {
        const traitDuration = Math.round((Date.now() - traitStartTime) / 1000);
        console.error(
          `   ❌ Error processing ${displayName}: ${error.message} (${traitDuration}s)`
        );
        errors.push({
          trait_id: config.trait_id || traitName,
          title: config.title || config.name || traitName,
          error: error.message,
          duration: traitDuration
        });
        errorCount++;
        console.log('');
      }
    }

    // Summary
    const totalDuration = Math.round((Date.now() - startTime) / 1000);
    const minutes = Math.floor(totalDuration / 60);
    const seconds = totalDuration % 60;
    const durationStr = minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;

    console.log('=====================================');
    console.log('🎉 ETL Pipeline Complete!');
    console.log(`📈 Processed: ${processedCount} traits`);
    console.log(`⚠️  Errors: ${errorCount} traits`);
    console.log(`⏱️  Total Duration: ${durationStr}`);

    // Export JSON manifest for frontend
    console.log('');
    console.log('📦 Exporting JSON manifest...');
    await exportTraitManifestJSON();

    if (errors.length > 0) {
      console.log('');
      console.log('❌ ERROR SUMMARY:');
      console.log('==================');
      for (const err of errors) {
        console.log(
          `   ${err.trait_id} (${err.title}): ${err.error} (${err.duration}s)`
        );
      }
    }

    console.log('🚀 Trait packs ready for serving');

    if (errorCount > 0) {
      process.exit(1);
    }
  } catch (error) {
    console.error('💥 Pipeline failed:', error.message);
    console.error(error.stack);
    process.exit(1);
  } finally {
    // Close database connection
    await closeManifestConnection();
  }
}

main().catch(console.error);
