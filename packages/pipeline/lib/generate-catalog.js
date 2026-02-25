// Generate simplified trait_catalog.json from database
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { getAllTraits } from './trait-db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const JSON_PATH = path.join(__dirname, '../../data_out/trait_manifest.json');

export async function generateSimplifiedCatalog() {
  const traits = await getAllTraits();
  
  const catalog = { traits: {} };
  for (const t of traits) {
    catalog.traits[t.trait_id] = {
      trait_id: t.trait_id,
      title: t.editorial_name || t.name,
      description: t.editorial_description || t.description,
      emoji: t.emoji || '',
      trait_type: t.trait_type || 'disease_risk',
      unit: t.unit || null
    };
  }
  
  await fs.writeFile(JSON_PATH, JSON.stringify(catalog, null, 2));
}
