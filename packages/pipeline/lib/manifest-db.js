import { execSync } from 'child_process';
import fs from 'fs/promises';
import path from 'path';

const OUTPUT_DIR = '/output';
const MANIFEST_DB = path.join(OUTPUT_DIR, 'manifest.duckdb');

export async function initManifestDB() {
  const sql = `
    CREATE TABLE IF NOT EXISTS traits (
      mondo_id VARCHAR PRIMARY KEY,
      name VARCHAR NOT NULL,
      description VARCHAR,
      categories VARCHAR NOT NULL,
      variant_count BIGINT,
      file_path VARCHAR,
      pgs_ids VARCHAR,
      pgs_metadata VARCHAR,
      source_hashes VARCHAR,
      last_updated VARCHAR,
      actual_variants BIGINT,
      file_size_mb DOUBLE,
      last_processed VARCHAR,
      expected_variants BIGINT,
      weight DOUBLE,
      last_validated VARCHAR,
      canonical_uri VARCHAR,
      excluded_pgs VARCHAR
    );
  `;
  
  const sqlFile = path.join(OUTPUT_DIR, 'init_manifest.sql');
  await fs.writeFile(sqlFile, sql);
  execSync(`duckdb ${MANIFEST_DB} < ${sqlFile}`, { cwd: OUTPUT_DIR, stdio: 'pipe' });
  await fs.unlink(sqlFile);
}

export async function upsertTrait(mondoId, traitData) {
  console.log(`  📝 Writing ${mondoId} to manifest DB`);
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
      '${JSON.stringify(traitData.excluded_pgs || []).replace(/'/g, "''")}'
    );
  `;
  
  const sqlFile = path.join(OUTPUT_DIR, `upsert_${mondoId.replace(':', '_')}.sql`);
  await fs.writeFile(sqlFile, sql);
  execSync(`duckdb ${MANIFEST_DB} < ${sqlFile}`, { cwd: OUTPUT_DIR, stdio: 'pipe' });
  await fs.unlink(sqlFile);
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
    traits[row.mondo_id] = {
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
