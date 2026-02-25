#!/usr/bin/env node
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MANIFEST_PATH = path.join(__dirname, '../data_out/trait_manifest.db');
const CATALOG_PATH = path.join(__dirname, '../packages/pipeline/trait_catalog.json');

function queryDB(sql) {
  const result = execSync(`duckdb "${MANIFEST_PATH}" -json -c "${sql.replace(/"/g, '\\"')}"`, {
    encoding: 'utf8',
    maxBuffer: 50 * 1024 * 1024
  });
  return result.trim() ? JSON.parse(result) : [];
}

const MEASUREMENT_CATEGORIES = [
  'Body measurement',
  'Cardiovascular measurement',
  'Lipid or lipoprotein measurement',
  'Hematological measurement',
  'Inflammatory measurement',
  'Other measurement'
];

function classifyTrait(categories) {
  try {
    const cats = JSON.parse(categories);
    return cats.some(cat => MEASUREMENT_CATEGORIES.includes(cat)) 
      ? 'quantitative' 
      : 'disease_risk';
  } catch {
    return 'disease_risk';
  }
}

console.log('Enriching trait catalog with trait types...\n');

const catalog = JSON.parse(fs.readFileSync(CATALOG_PATH, 'utf8'));

const traits = queryDB('SELECT trait_id, categories FROM traits');

let quantCount = 0;
let diseaseCount = 0;

for (const trait of traits) {
  if (catalog.traits[trait.trait_id]) {
    const traitType = classifyTrait(trait.categories);
    catalog.traits[trait.trait_id].trait_type = traitType;
    
    if (traitType === 'quantitative') {
      quantCount++;
    } else {
      diseaseCount++;
    }
  }
}

fs.writeFileSync(CATALOG_PATH, JSON.stringify(catalog, null, 2));

console.log(`✓ Updated ${quantCount} quantitative traits`);
console.log(`✓ Updated ${diseaseCount} disease/risk traits`);
console.log(`\nTrait catalog updated at: ${CATALOG_PATH}\n`);
