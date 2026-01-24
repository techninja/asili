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

export async function upsertTrait(mondoId, traitData) {
  const sql = `
    INSERT OR REPLACE INTO traits VALUES (
      '${mondoId}',
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
      '${JSON.stringify(traitData.excluded_pgs || []).replace(/'/g, "''")}',
      ${traitData.empirical_stats ? `'${JSON.stringify(traitData.empirical_stats).replace(/'/g, "''")}'` : 'NULL'}
    );
  `;
  
  execSync(`duckdb ${MANIFEST_DB} "${sql.replace(/"/g, '\\"')}"`, { cwd: OUTPUT_DIR, stdio: 'pipe' });
}

export async function exportManifests() {
  // Copy manifest.duckdb to trait_manifest.db for frontend streaming
  const traitManifestDB = path.join(OUTPUT_DIR, 'trait_manifest.db');
  await fs.copyFile(MANIFEST_DB, traitManifestDB);
  
  // Export to JSON (write directly to file to avoid buffer overflow)
  const jsonSQL = `COPY (SELECT * FROM traits) TO '${OUTPUT_DIR}/traits_raw.json' (FORMAT JSON, ARRAY true);`;
  const sqlFile = path.join(OUTPUT_DIR, 'export_json.sql');
  await fs.writeFile(sqlFile, jsonSQL);
  execSync(`duckdb ${MANIFEST_DB} < ${sqlFile}`, { cwd: OUTPUT_DIR, stdio: 'pipe' });
  await fs.unlink(sqlFile);
  
  // Read and transform to manifest format
  const rawJson = await fs.readFile(path.join(OUTPUT_DIR, 'traits_raw.json'), 'utf8');
  const rows = JSON.parse(rawJson);
  const traits = {};
  
  for (const row of rows) {
    const traitData = {
      name: row.name,
      description: row.description,
      categories: JSON.parse(row.categories),
      variant_count: row.variant_count,
      file_path: row.file_path,
      pgs_ids: JSON.parse(row.pgs_ids),
      pgs_metadata: JSON.parse(row.pgs_metadata),
      source_hashes: JSON.parse(row.source_hashes),
      last_updated: row.last_updated,
      actual_variants: row.actual_variants,
      file_size_mb: row.file_size_mb,
      last_processed: row.last_processed,
      expected_variants: row.expected_variants,
      weight: row.weight,
      mondo_id: row.mondo_id,
      last_validated: row.last_validated,
      canonical_uri: row.canonical_uri,
      excluded_pgs: JSON.parse(row.excluded_pgs)
    };
    
    // Add empirical stats if available
    if (row.empirical_stats) {
      traitData.empirical_stats = JSON.parse(row.empirical_stats);
    }
    
    traits[row.mondo_id] = traitData;
  }
  
  const manifest = {
    traits,
    generated_at: new Date().toISOString()
  };
  
  await fs.writeFile(
    path.join(OUTPUT_DIR, 'trait_manifest.json'),
    JSON.stringify(manifest, null, 2)
  );
  
  await fs.unlink(path.join(OUTPUT_DIR, 'traits_raw.json'));
  
  console.log('✓ Exported trait_manifest.json and trait_manifest.db');
}
