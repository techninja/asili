import { execSync } from 'child_process';
import fs from 'fs/promises';
import path from 'path';

const OUTPUT_DIR = '/output';
const MANIFEST_DB = path.join(OUTPUT_DIR, 'manifest.duckdb');

export async function getCompletedTraits() {
  try {
    const sql = `
      SELECT 
        mondo_id,
        json_array_length(pgs_ids) as pgs_count,
        length(pgs_metadata) as meta_len
      FROM traits 
      WHERE json_array_length(pgs_ids) > 0;
    `;
    const sqlFile = path.join(OUTPUT_DIR, 'check_completed.sql');
    await fs.writeFile(sqlFile, sql);
    
    const result = execSync(`duckdb ${MANIFEST_DB} -json < ${sqlFile}`, {
      cwd: OUTPUT_DIR,
      encoding: 'utf8'
    });
    await fs.unlink(sqlFile);
    
    const rows = JSON.parse(result);
    const completed = {};
    for (const row of rows) {
      // Only count as complete if metadata is substantial (not just '{}')
      if (row.meta_len > 10) {
        completed[row.mondo_id] = row.pgs_count;
      }
    }
    return completed;
  } catch {
    return {};
  }
}

export async function getAllTraitMetadata() {
  try {
    const sql = `
      COPY (
        SELECT mondo_id, pgs_metadata
        FROM traits 
        WHERE length(pgs_metadata) > 10
      ) TO '${OUTPUT_DIR}/all_metadata.json' (FORMAT JSON, ARRAY true);
    `;
    const sqlFile = path.join(OUTPUT_DIR, 'get_all_metadata.sql');
    await fs.writeFile(sqlFile, sql);
    
    execSync(`duckdb ${MANIFEST_DB} < ${sqlFile}`, {
      cwd: OUTPUT_DIR,
      stdio: 'pipe'
    });
    await fs.unlink(sqlFile);
    
    const rawJson = await fs.readFile(path.join(OUTPUT_DIR, 'all_metadata.json'), 'utf8');
    const rows = JSON.parse(rawJson);
    const metadata = {};
    for (const row of rows) {
      if (row.pgs_metadata) {
        const parsed = JSON.parse(row.pgs_metadata);
        if (Object.keys(parsed).length > 0) {
          metadata[row.mondo_id] = parsed;
        }
      }
    }
    await fs.unlink(path.join(OUTPUT_DIR, 'all_metadata.json'));
    return metadata;
  } catch {
    return {};
  }
}

export async function getTraitMetadata(mondoId) {
  try {
    const sql = `SELECT pgs_metadata FROM traits WHERE mondo_id = '${mondoId}';`;
    const sqlFile = path.join(OUTPUT_DIR, `get_meta_${mondoId.replace(':', '_')}.sql`);
    await fs.writeFile(sqlFile, sql);
    
    const result = execSync(`duckdb ${MANIFEST_DB} -json < ${sqlFile}`, {
      cwd: OUTPUT_DIR,
      encoding: 'utf8'
    });
    await fs.unlink(sqlFile);
    
    const rows = JSON.parse(result);
    if (!rows || rows.length === 0) {
      console.log(`    No DB entry found for ${mondoId}`);
      return {};
    }
    if (rows[0]?.pgs_metadata) {
      const parsed = JSON.parse(rows[0].pgs_metadata);
      return Object.keys(parsed).length > 0 ? parsed : {};
    }
    return {};
  } catch (err) {
    console.log(`    Warning: Could not load metadata for ${mondoId}: ${err.message}`);
    return {};
  }
}
