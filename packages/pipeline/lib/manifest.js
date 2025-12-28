import fs from 'fs/promises';
import path from 'path';
import { loadTraitCatalog } from './catalog.js';

const OUTPUT_DIR = '/output';

export async function updateOutputManifest(updatedData) {
    const manifestPath = path.join(OUTPUT_DIR, 'trait_manifest.json');
    const catalog = await loadTraitCatalog();
    
    let manifest = { 
        trait_families: catalog.trait_families,
        traits: {}, 
        generated_at: new Date().toISOString() 
    };
    
    try {
        const existing = await fs.readFile(manifestPath, 'utf8');
        const existingManifest = JSON.parse(existing);
        manifest.traits = existingManifest.traits || {};
    } catch {}
    
    // Update manifest with generated files and metadata
    for (const [traitName, data] of Object.entries(updatedData)) {
        if (data.metadata_only) {
            // Only update metadata, preserve existing file info
            const existing = manifest.traits[traitName] || {};
            manifest.traits[traitName] = {
                ...existing,
                pgs_metadata: data.pgs_metadata,
                last_updated: data.timestamp
            };
        } else {
            // Full update with new files
            manifest.traits[traitName] = {
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