import { loadTraitCatalog } from './catalog.js';
import { loadTraitManifest, saveTraitManifest } from './manifest-interface.js';
import pgsApiClient from '../pgs-api-client.js';

// Category mapping for better organization
const CATEGORY_MAPPING = {
    'Cancer': 'Cancer',
    'Neurological disorder': 'Neurological Disorders', 
    'Cardiovascular disease': 'Cardiovascular Disease',
    'Metabolic disorder': 'Metabolic Disorders',
    'Immune system disorder': 'Immune System Disorders',
    'Mental health disorder': 'Mental Health',
    'Digestive system disorder': 'Digestive System Disorders'
};

async function getTraitCategories(mondoId) {
    try {
        const traitInfo = await pgsApiClient.getTraitInfo(mondoId);
        if (traitInfo?.trait_categories?.length > 0) {
            return traitInfo.trait_categories.map(cat => CATEGORY_MAPPING[cat] || cat);
        }
    } catch (error) {
        // Silently fall back to default category
    }
    
    return ['Other Conditions']; // Only use as fallback when no other categories exist
}

export async function updateOutputManifest(updatedData) {
    const catalog = await loadTraitCatalog();
    const manifest = await loadTraitManifest();
    
    // Handle trait-specific updates
    if (updatedData.trait_update) {
        for (const [mondoId, traitData] of Object.entries(updatedData.trait_update)) {
            const traitInfo = catalog.traits[mondoId];
            if (!traitInfo) continue;
            
            if (!manifest.traits[mondoId]) {
                manifest.traits[mondoId] = {
                    name: traitInfo.title,
                    categories: await getTraitCategories(mondoId),
                    variant_count: 0,
                    file_path: `${mondoId.replace(':', '_')}_hg38.parquet`,
                    pgs_metadata: {},
                    source_hashes: {},
                    last_updated: new Date().toISOString(),
                    actual_variants: 0,
                    file_size_mb: 0,
                    last_processed: new Date().toISOString(),
                    expected_variants: 0,
                    weight: 1.0,
                    pgs_ids: [],
                    mondo_id: mondoId,
                    last_validated: new Date().toISOString()
                };
            }
            
                manifest.traits[mondoId] = {
                    ...manifest.traits[mondoId],
                    ...traitData,
                    file_path: traitData.file_path || manifest.traits[mondoId]?.file_path || `${mondoId.replace(':', '_')}_hg38.parquet`,
                    last_validated: manifest.traits[mondoId]?.last_validated || new Date().toISOString()
                };
        }
    }
    
    // Handle metadata-only updates during collection
    if (updatedData.metadata_update) {
        const pgsMetadata = updatedData.metadata_update.pgs_metadata;
        const pgsIds = Object.keys(pgsMetadata);
        
        // Find matching trait in catalog
        for (const [mondoId, traitData] of Object.entries(catalog.traits)) {
            const traitPgsIds = traitData.pgs_ids || [];
            const hasMatchingPgs = pgsIds.some(pgsId => traitPgsIds.includes(pgsId));
            
            if (hasMatchingPgs) {
                if (!manifest.traits[mondoId]) {
                    manifest.traits[mondoId] = {
                        name: traitData.title,
                        categories: await getTraitCategories(mondoId),
                        variant_count: 0,
                        file_path: `${mondoId.replace(':', '_')}_hg38.parquet`,
                        pgs_metadata: {},
                        source_hashes: {},
                        last_updated: new Date().toISOString(),
                        actual_variants: 0,
                        file_size_mb: 0,
                        last_processed: new Date().toISOString(),
                        expected_variants: 0,
                        weight: 1.0,
                        pgs_ids: [],
                        mondo_id: mondoId,
                        last_validated: new Date().toISOString()
                    };
                }
                
                // Only update metadata that doesn't already exist
                const existingMetadata = manifest.traits[mondoId].pgs_metadata || {};
                const newMetadata = {};
                for (const [pgsId, metadata] of Object.entries(pgsMetadata)) {
                    if (!existingMetadata[pgsId]) {
                        newMetadata[pgsId] = metadata;
                    }
                }
                
                if (Object.keys(newMetadata).length > 0) {
                    manifest.traits[mondoId] = {
                        ...manifest.traits[mondoId],
                        pgs_metadata: { ...existingMetadata, ...newMetadata },
                        last_updated: new Date().toISOString(),
                        file_path: manifest.traits[mondoId]?.file_path || `${mondoId.replace(':', '_')}_hg38.parquet`,
                        last_validated: manifest.traits[mondoId]?.last_validated || new Date().toISOString()
                    };
                }
                break;
            }
        }
    }
    
    // Handle full trait processing updates
    if (!updatedData.metadata_update && !updatedData.trait_update) {
        for (const [mondoId, data] of Object.entries(updatedData)) {
            const traitInfo = catalog.traits[mondoId];
            if (!traitInfo) continue;
            
            manifest.traits[mondoId] = {
                name: traitInfo.title,
                description: `Polygenic risk score for ${traitInfo.title}`,
                categories: await getTraitCategories(mondoId),
                variant_count: data.variant_count,
                file_path: data.fileName || `${mondoId.replace(':', '_')}_hg38.parquet`,
                pgs_metadata: data.pgs_metadata || {},
                source_hashes: data.source_hashes || {},
                last_updated: data.timestamp,
                actual_variants: data.variant_count || 0,
                file_size_mb: data.file_size_mb || 0,
                last_processed: data.timestamp,
                expected_variants: data.expected_variants || data.variant_count || 0,
                weight: data.weight || 1.0,
                pgs_ids: data.pgsIds || [],
                mondo_id: mondoId,
                last_validated: data.timestamp
            };
        }
    }
    
    manifest.generated_at = new Date().toISOString();
    await saveTraitManifest(manifest);
}