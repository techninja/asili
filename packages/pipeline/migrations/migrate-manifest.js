#!/usr/bin/env node

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { saveTraitManifest } from '../lib/manifest-interface.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUTPUT_DIR = '/Users/techninja/web/asili/data_out';

async function migrateManifest() {
    const manifestPath = path.join(OUTPUT_DIR, 'trait_manifest.json');
    
    try {
        console.log('Reading existing manifest...');
        const data = await fs.readFile(manifestPath, 'utf8');
        const oldManifest = JSON.parse(data);
        
        if (!oldManifest.trait_families) {
            console.log('No trait_families found - manifest may already be migrated');
            return;
        }
        
        console.log('Converting to new format...');
        const newManifest = {
            traits: {},
            generated_at: new Date().toISOString()
        };
        
        // Convert trait_families structure to keyed traits
        for (const [familyName, family] of Object.entries(oldManifest.trait_families)) {
            if (family.subtypes) {
                for (const [mondoId, subtype] of Object.entries(family.subtypes)) {
                    // Find corresponding data in old traits section
                    const traitKey = `${subtype.name}_${mondoId}`;
                    const traitData = oldManifest.traits?.[traitKey] || {};
                    
                    newManifest.traits[mondoId] = {
                        name: subtype.name,
                        description: subtype.description || `Polygenic risk score for ${subtype.name}`,
                        categories: [familyName], // Convert family to category
                        variant_count: traitData.variant_count || 0,
                        file_path: traitData.file_path || '',
                        pgs_metadata: traitData.pgs_metadata || {},
                        source_hashes: traitData.source_hashes || {},
                        last_updated: traitData.last_updated || new Date().toISOString()
                    };
                }
            }
        }
        
        console.log(`Converted ${Object.keys(newManifest.traits).length} traits`);
        
        // Backup old manifest
        const backupPath = path.join(OUTPUT_DIR, 'trait_manifest_backup.json');
        await fs.writeFile(backupPath, JSON.stringify(oldManifest, null, 2));
        console.log(`Backed up old manifest to: ${backupPath}`);
        
        // Save new manifest using schema validation
        await saveTraitManifest(newManifest);
        console.log('Migration complete! New manifest saved with schema validation.');
        
        // Show summary
        const categories = new Set();
        Object.values(newManifest.traits).forEach(trait => {
            trait.categories?.forEach(cat => categories.add(cat));
        });
        
        console.log('\nSummary:');
        console.log(`- ${Object.keys(newManifest.traits).length} traits`);
        console.log(`- ${categories.size} categories: ${Array.from(categories).join(', ')}`);
        
    } catch (error) {
        console.error('Migration failed:', error.message);
        process.exit(1);
    }
}

migrateManifest();