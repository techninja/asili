import fs from 'fs/promises';
import path from 'path';
import { loadTraitCatalog } from './catalog.js';

const OUTPUT_DIR = '/output';

export async function updateOutputManifest(updatedData) {
    const manifestPath = path.join(OUTPUT_DIR, 'trait_manifest.json');
    const catalog = await loadTraitCatalog();
    
    let manifest = { 
        trait_families: {},
        traits: {},
        generated_at: new Date().toISOString() 
    };
    
    try {
        const existing = await fs.readFile(manifestPath, 'utf8');
        const existingManifest = JSON.parse(existing);
        manifest.trait_families = existingManifest.trait_families || {};
        manifest.traits = existingManifest.traits || {};
    } catch {}
    
    // Handle metadata-only updates during collection
    if (updatedData.metadata_update) {
        // Find which trait this metadata belongs to by checking PGS IDs
        const pgsMetadata = updatedData.metadata_update.pgs_metadata;
        const pgsIds = Object.keys(pgsMetadata);
        
        // Find matching trait in catalog
        for (const [mondoId, traitData] of Object.entries(catalog.traits)) {
            const traitPgsIds = traitData.pgs_ids || [];
            const hasMatchingPgs = pgsIds.some(pgsId => traitPgsIds.includes(pgsId));
            
            if (hasMatchingPgs) {
                const familyName = traitData.title;
                const traitId = `${familyName}_${mondoId}`;
                
                // Create family with subtypes structure for frontend
                if (!manifest.trait_families[familyName]) {
                    manifest.trait_families[familyName] = {
                        name: familyName,
                        mondo_id: mondoId,
                        subtypes: {
                            [mondoId]: {
                                name: traitData.title,
                                description: `Polygenic risk score for ${traitData.title}`,
                                pgs_ids: traitData.pgs_ids,
                                weight: 1.0
                            }
                        }
                    };
                }
                
                // Update traits section
                if (!manifest.traits[traitId]) {
                    manifest.traits[traitId] = {};
                }
                
                const existing = manifest.traits[traitId];
                manifest.traits[traitId] = {
                    ...existing,
                    pgs_metadata: { ...existing.pgs_metadata, ...pgsMetadata },
                    last_updated: new Date().toISOString()
                };
                break;
            }
        }
    } else {
        // Update manifest with generated files and metadata
        for (const [mondoId, data] of Object.entries(updatedData)) {
            // Find trait info from catalog
            const traitInfo = catalog.traits[mondoId];
            if (!traitInfo) continue;
            
            const familyName = traitInfo.title;
            const traitId = `${familyName}_${mondoId}`;
            
            // Create family with subtypes structure for frontend
            if (!manifest.trait_families[familyName]) {
                manifest.trait_families[familyName] = {
                    name: familyName,
                    mondo_id: mondoId,
                    subtypes: {
                        [mondoId]: {
                            name: traitInfo.title,
                            description: `Polygenic risk score for ${traitInfo.title}`,
                            pgs_ids: traitInfo.pgs_ids,
                            weight: 1.0
                        }
                    }
                };
            }
            
            // Update traits section
            manifest.traits[traitId] = {
                last_updated: data.timestamp,
                variant_count: data.variant_count,
                file_path: data.fileName,
                pgs_ids: data.pgsIds,
                source_hashes: data.source_hashes,
                pgs_metadata: data.pgs_metadata
            };
        }
    }
    
    manifest.generated_at = new Date().toISOString();
    await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2));
}