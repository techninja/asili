#!/usr/bin/env node

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { loadTraitCatalog, getTraitConfigs } from './lib/catalog.js';
import { generateTraitPack } from './lib/processor.js';
import { updateOutputManifest } from './lib/manifest.js';

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
    const traitConfigs = getTraitConfigs(catalog);

    console.log(
      `📊 Found ${Object.keys(traitConfigs).length} trait configurations`
    );
    console.log('');

    // Process each trait - sort by variant count (largest first) for better memory management
    const sortedTraits = Object.entries(traitConfigs).sort(
      ([, a], [, b]) => (b.expected_variants || 0) - (a.expected_variants || 0)
    );

    for (const [traitName, config] of sortedTraits) {
      const displayName = `${config.name || config.title || traitName} (${config.mondo_id || traitName})`;
      const traitStartTime = Date.now();

      try {
        console.log(`🔄 Processing: ${displayName}`);
        const result = await generateTraitPack(traitName, config);
        await updateOutputManifest({ [traitName]: result });

        const traitDuration = Math.round((Date.now() - traitStartTime) / 1000);

        if (result.metadata_only) {
          console.log(
            `   ✅ Updated metadata for ${displayName} (${traitDuration}s)`
          );
        } else {
          console.log(
            `   ✅ Generated ${displayName} (${result.variant_count} variants, ${traitDuration}s)`
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
          mondo_id: config.mondo_id || traitName,
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

    if (errors.length > 0) {
      console.log('');
      console.log('❌ ERROR SUMMARY:');
      console.log('==================');
      for (const err of errors) {
        console.log(
          `   ${err.mondo_id} (${err.title}): ${err.error} (${err.duration}s)`
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
  }
}

main().catch(console.error);
