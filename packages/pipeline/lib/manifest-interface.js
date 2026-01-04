import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUTPUT_DIR = '/output';

let manifestSchema = null;
let ajv = null;

async function loadSchema() {
    if (!manifestSchema) {
        const schemaPath = path.join(__dirname, '../trait-manifest-schema.json');
        const schemaData = await fs.readFile(schemaPath, 'utf8');
        manifestSchema = JSON.parse(schemaData);
        
        ajv = new Ajv({ allErrors: true });
        addFormats(ajv);
        ajv.addSchema(manifestSchema, 'manifest');
    }
    return manifestSchema;
}

export async function loadTraitManifest() {
    const manifestPath = path.join(OUTPUT_DIR, 'trait_manifest.json');
    
    try {
        const data = await fs.readFile(manifestPath, 'utf8');
        const manifest = JSON.parse(data);
        
        // Validate against schema
        await loadSchema();
        const validate = ajv.getSchema('manifest');
        const valid = validate(manifest);
        
        if (!valid) {
            console.warn('Manifest validation errors:', validate.errors);
        }
        
        return manifest;
    } catch (error) {
        if (error.code === 'ENOENT') {
            return {
                traits: {},
                generated_at: new Date().toISOString()
            };
        }
        throw error;
    }
}

export async function saveTraitManifest(manifest) {
    await loadSchema();
    
    // Validate before saving
    const validate = ajv.getSchema('manifest');
    const valid = validate(manifest);
    
    if (!valid) {
        throw new Error(`Manifest validation failed: ${JSON.stringify(validate.errors, null, 2)}`);
    }
    
    const manifestPath = path.join(OUTPUT_DIR, 'trait_manifest.json');
    await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2));
}

export function getTraitCategories(manifest) {
    const categories = new Set();
    
    for (const trait of Object.values(manifest.traits)) {
        trait.categories?.forEach(cat => categories.add(cat));
    }
    
    return Array.from(categories).sort();
}

export function getTraitsByCategory(manifest, category) {
    const traits = {};
    
    for (const [mondoId, trait] of Object.entries(manifest.traits)) {
        if (trait.categories?.includes(category)) {
            traits[mondoId] = trait;
        }
    }
    
    return traits;
}