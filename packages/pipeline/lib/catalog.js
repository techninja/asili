import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export async function loadTraitCatalog() {
    const catalogPath = path.join(__dirname, '../trait_catalog.json');
    const data = await fs.readFile(catalogPath, 'utf8');
    return JSON.parse(data);
}

export function getTraitConfigs(catalog) {
    const configs = {};
    
    for (const [familyName, familyData] of Object.entries(catalog.trait_families)) {
        // Process subtypes
        for (const [subtypeName, subtypeData] of Object.entries(familyData.subtypes || {})) {
            const key = `${familyName}_${subtypeName}`;
            configs[key] = {
                pgs_ids: subtypeData.pgs_ids,
                name: subtypeData.name,
                description: subtypeData.description,
                category: familyData.category,
                source_family: familyName,
                source_type: 'subtype',
                source_subtype: subtypeName,
                weight: subtypeData.weight || 1.0
            };
        }
        
        // Process biomarkers
        if (familyData.biomarkers) {
            for (const [biomarkerName, biomarkerData] of Object.entries(familyData.biomarkers)) {
                const key = `${familyName}_${biomarkerName}`;
                configs[key] = {
                    pgs_ids: biomarkerData.pgs_ids,
                    name: biomarkerData.name,
                    description: biomarkerData.description || '',
                    category: familyData.category,
                    source_family: familyName,
                    source_type: 'biomarker',
                    source_subtype: biomarkerName,
                    weight: 1.0
                };
            }
        }
    }
    
    return configs;
}