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
            try {
                console.log(`🔄 Processing: ${traitName}`);
                const result = await generateTraitPack(traitName, config);
                await updateOutputManifest({ [traitName]: result });
                
                if (result.metadata_only) {
                    console.log(`✅ Updated metadata for ${traitName}`);
                } else {
                    console.log(`✅ Generated ${traitName} (${result.variant_count} variants)`);
                }
                
                processedCount++;
                console.log('');
                
            } catch (error) {
                console.error(`❌ Error processing ${traitName}: ${error.message}`);
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