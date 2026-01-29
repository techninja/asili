#!/usr/bin/env node

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { loadTraitCatalog, getTraitConfigs } from './lib/catalog.js';
import { generateTraitPack } from './lib/processor.js';
import { updateOutputManifest, finalizeManifest } from './lib/manifest.js';
import { initManifestDB } from './lib/manifest-db.js';
import { getCompletedTraits, getAllTraitMetadata } from './lib/manifest-db-check.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function main() {
  console.log('🧬 Asili ETL Pipeline Starting...');
  console.log('=====================================');

  const startTime = Date.now();
  let processedCount = 0;
  let errorCount = 0;
  const errors = [];

  try {
    // Initialize manifest database
    console.log('🗄️  Initializing manifest database...');
    await initManifestDB();
    
    // Load trait catalog
    console.log('📋 Loading trait catalog...');
    const catalog = await loadTraitCatalog();
    const traitConfigs = getTraitConfigs(catalog);

    // Get already completed traits (have metadata and will be validated during processing)
    const completedTraits = await getCompletedTraits();
    console.log(`✓ ${Object.keys(completedTraits).length} traits have complete metadata`);
    console.log(`🔍 DEBUG: completedTraits sample:`, Object.entries(completedTraits).slice(0, 3));
    
    // Load all existing metadata once
    console.log('📚 Loading all trait metadata...');
    const allMetadata = await getAllTraitMetadata();
    console.log(`✓ Loaded metadata for ${Object.keys(allMetadata).length} traits`);
    console.log(`🔍 DEBUG: allMetadata keys: ${Object.keys(allMetadata).slice(0, 5).join(', ')}...`);
    
    // Show sample of what's in the metadata
    const firstKey = Object.keys(allMetadata)[0];
    if (firstKey) {
      console.log(`🔍 DEBUG: Sample metadata for ${firstKey}: ${Object.keys(allMetadata[firstKey]).length} PGS entries`);
    }
    
    // Filter to traits missing metadata
    const incompleteTraits = Object.entries(traitConfigs).filter(([traitName, config]) => {
      const traitId = config.trait_id || traitName;
      const expectedCount = config.pgs_ids?.length || 0;
      const completedCount = completedTraits[traitId] || 0;
      const isComplete = completedCount > 0 && completedCount === expectedCount;
      if (isComplete) {
        console.log(`🔍 DEBUG: Skipping ${traitId} - ${completedCount}/${expectedCount} PGS complete`);
      }
      return !isComplete;
    });
    
    console.log(`📊 Processing ${incompleteTraits.length} traits (${Object.keys(traitConfigs).length - incompleteTraits.length} complete)`);
    console.log('');

    // Process incomplete traits - sort by variant count (largest first)
    const sortedTraits = incompleteTraits.sort(
      ([, a], [, b]) => (b.expected_variants || 0) - (a.expected_variants || 0)
    );

    for (const [traitName, config] of sortedTraits) {
      const displayName = `${config.name || config.title || traitName} (${config.trait_id || traitName})`;
      const traitStartTime = Date.now();

      try {
        console.log(`🔄 Processing: ${displayName}`);
        const result = await generateTraitPack(traitName, config, allMetadata);
        
        // Only update DB if we actually generated new files (not just metadata check)
        if (!result.metadata_only) {
          await updateOutputManifest({ [traitName]: result });
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

    // Export final manifests
    console.log('');
    console.log('📦 Exporting manifests...');
    await finalizeManifest();

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
  }
}

main().catch(console.error);
