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
    
    try {
        // Load trait catalog
        console.log('📋 Loading trait catalog...');
        const catalog = await loadTraitCatalog();
        const traitConfigs = getTraitConfigs(catalog);
        
        console.log(`📊 Found ${Object.keys(traitConfigs).length} trait configurations`);
        console.log('');
        
        // Process each trait
        for (const [traitName, config] of Object.entries(traitConfigs)) {
            const displayName = `${config.name || config.title || traitName} (${config.mondo_id || traitName})`;
            const traitStartTime = Date.now();
            
            try {
                console.log(`🔄 Processing: ${displayName}`);
                const result = await generateTraitPack(traitName, config);
                await updateOutputManifest({ [traitName]: result });
                
                const traitDuration = Math.round((Date.now() - traitStartTime) / 1000);
                
                if (result.metadata_only) {
                    console.log(`   ✅ Updated metadata for ${displayName} (${traitDuration}s)`);
                } else {
                    console.log(`   ✅ Generated ${displayName} (${result.variant_count} variants, ${traitDuration}s)`);
                }
                
                processedCount++;
                console.log('');
                
            } catch (error) {
                const traitDuration = Math.round((Date.now() - traitStartTime) / 1000);
                console.error(`   ❌ Error processing ${displayName}: ${error.message} (${traitDuration}s)`);
                errorCount++;
                console.log('');
            }
        }
        
        // Summary
        const duration = Math.round((Date.now() - startTime) / 1000);
        console.log('=====================================');
        console.log('🎉 ETL Pipeline Complete!');
        console.log(`📈 Processed: ${processedCount} traits`);
        console.log(`⚠️  Errors: ${errorCount} traits`);
        console.log(`⏱️  Duration: ${duration}s`);
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