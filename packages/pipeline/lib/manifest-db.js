import { execSync } from 'child_process';
import fs from 'fs/promises';
import path from 'path';

const OUTPUT_DIR = '/output';
const MANIFEST_DB = path.join(OUTPUT_DIR, 'manifest.duckdb');

export async function initManifestDB() {
  // Run migrations
  const migrationsDir = path.join(path.dirname(new URL(import.meta.url).pathname), '../migrations');
  const migrations = (await fs.readdir(migrationsDir))
    .filter(f => f.endsWith('.sql'))
    .sort();
  
  for (const migration of migrations) {
    const migrationPath = path.join(migrationsDir, migration);
    const sql = await fs.readFile(migrationPath, 'utf-8');
    const tempFile = path.join(OUTPUT_DIR, `migration_${migration}`);
    await fs.writeFile(tempFile, sql);
    execSync(`duckdb ${MANIFEST_DB} < ${tempFile}`, { cwd: OUTPUT_DIR, stdio: 'pipe' });
    await fs.unlink(tempFile);
  }
}

export async function upsertTrait(traitId, traitData) {
  const sql = `
    INSERT OR REPLACE INTO traits VALUES (
      '${traitId}',
      '${traitData.name.replace(/'/g, "''")}',
      ${traitData.description ? `'${traitData.description.replace(/'/g, "''")}'` : 'NULL'},
      '${JSON.stringify(traitData.categories || []).replace(/'/g, "''")}',
      ${traitData.variant_count || 0},
      '${traitData.file_path}',
      '${JSON.stringify(traitData.pgs_ids || []).replace(/'/g, "''")}',
      '${JSON.stringify(traitData.pgs_metadata || {}).replace(/'/g, "''")}',
      '${JSON.stringify(traitData.source_hashes || {}).replace(/'/g, "''")}',
      '${traitData.last_updated}',
      ${traitData.actual_variants || 0},
      ${traitData.file_size_mb || 0},
      '${traitData.last_processed}',
      ${traitData.expected_variants || 0},
      ${traitData.weight || 1.0},
      ${traitData.last_validated ? `'${traitData.last_validated}'` : 'NULL'},
      ${traitData.canonical_uri ? `'${traitData.canonical_uri}'` : 'NULL'},
      '${JSON.stringify(traitData.excluded_pgs || []).replace(/'/g, "''")}'
    );
  `;
  
  execSync(`duckdb ${MANIFEST_DB} "${sql.replace(/"/g, '\\"')}"`, { cwd: OUTPUT_DIR, stdio: 'pipe' });
}

export async function updateTraitMetadata(traitId, pgsMetadata) {
  console.log(`      💾 Saving metadata to DB for ${traitId} (${Object.keys(pgsMetadata).length} PGS entries)`);
  const sql = `UPDATE traits SET pgs_metadata = '${JSON.stringify(pgsMetadata).replace(/'/g, "''")}' WHERE trait_id = '${traitId}';`;
  try {
    execSync(`duckdb ${MANIFEST_DB} "${sql.replace(/"/g, '\\"')}"`, { cwd: OUTPUT_DIR, stdio: 'pipe' });
  } catch (err) {
    console.log(`      ⚠️  Failed to save metadata: ${err.message}`);
  }
}

export async function exportManifests() {
  // Copy manifest.duckdb to trait_manifest.db for frontend streaming
  const traitManifestDB = path.join(OUTPUT_DIR, 'trait_manifest.db');
  await fs.copyFile(MANIFEST_DB, traitManifestDB);
  
  // Load trait_catalog.json for normalization parameters
  let traitCatalog = {};
  try {
    const catalogPath = path.join(path.dirname(new URL(import.meta.url).pathname), '../trait_catalog.json');
    const catalogData = await fs.readFile(catalogPath, 'utf8');
    traitCatalog = JSON.parse(catalogData);
  } catch (err) {
    console.warn('⚠️  Could not load trait_catalog.json for normalization data:', err.message);
  }
  
  // Export as CSV to avoid JSON escaping issues
  const querySQL = `COPY (SELECT * FROM traits) TO '/output/traits_export.jsonl' (FORMAT JSON);`;
  const sqlFile = path.join(OUTPUT_DIR, 'export_query.sql');
  await fs.writeFile(sqlFile, querySQL);
  execSync(`duckdb ${MANIFEST_DB} < ${sqlFile}`, { cwd: OUTPUT_DIR, stdio: 'pipe' });
  await fs.unlink(sqlFile);
  
  const jsonlContent = await fs.readFile(path.join(OUTPUT_DIR, 'traits_export.jsonl'), 'utf8');
  const rows = jsonlContent.trim().split('\n').map(line => JSON.parse(line));
  await fs.unlink(path.join(OUTPUT_DIR, 'traits_export.jsonl'));
  const traits = {};
  
  for (const row of rows) {
    // JSON columns are stored as strings in DB, already valid JSON
    let pgsIdsArray, categories, pgsMetadata, sourceHashes, excludedPgs;
    
    try {
      // If already parsed by JSON Lines, use directly; otherwise parse the string
      pgsIdsArray = Array.isArray(row.pgs_ids) ? row.pgs_ids : JSON.parse(row.pgs_ids || '[]');
      categories = Array.isArray(row.categories) ? row.categories : JSON.parse(row.categories || '[]');
      pgsMetadata = (typeof row.pgs_metadata === 'object' && !Array.isArray(row.pgs_metadata)) ? row.pgs_metadata : JSON.parse(row.pgs_metadata || '{}');
      sourceHashes = (typeof row.source_hashes === 'object' && !Array.isArray(row.source_hashes)) ? row.source_hashes : JSON.parse(row.source_hashes || '{}');
      excludedPgs = Array.isArray(row.excluded_pgs) ? row.excluded_pgs : JSON.parse(row.excluded_pgs || '[]');
    } catch (err) {
      console.error(`❌ Error parsing JSON for trait ${row.trait_id}:`, err.message);
      console.error(`   Skipping trait - data may be corrupted in database`);
      continue;
    }
    
    // Enrich with normalization parameters from trait_catalog if available
    let enrichedPgsIds = pgsIdsArray;
    if (traitCatalog.traits && traitCatalog.traits[row.trait_id]) {
      const catalogTrait = traitCatalog.traits[row.trait_id];
      if (catalogTrait.pgs_ids && Array.isArray(catalogTrait.pgs_ids)) {
        enrichedPgsIds = catalogTrait.pgs_ids; // Use full objects with norm_mean/norm_sd
      }
    }
    
    const traitData = {
      name: row.name,
      description: row.description,
      categories: categories,
      variant_count: row.variant_count,
      file_path: row.file_path,
      pgs_ids: enrichedPgsIds,
      pgs_metadata: pgsMetadata,
      source_hashes: sourceHashes,
      last_updated: row.last_updated,
      actual_variants: row.actual_variants,
      file_size_mb: row.file_size_mb,
      last_processed: row.last_processed,
      expected_variants: row.expected_variants,
      weight: row.weight,
      trait_id: row.trait_id,
      last_validated: row.last_validated,
      canonical_uri: row.canonical_uri,
      excluded_pgs: excludedPgs
    };
    
    traits[row.trait_id] = traitData;
  }
  
  const manifest = {
    traits,
    generated_at: new Date().toISOString()
  };
  
  await fs.writeFile(
    path.join(OUTPUT_DIR, 'trait_manifest.json'),
    JSON.stringify(manifest, null, 2)
  );
  
  console.log(`✓ Exported ${Object.keys(traits).length} traits to trait_manifest.json and trait_manifest.db`);
}
