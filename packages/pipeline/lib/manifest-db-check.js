import { getConnection } from './shared-db.js';

/**
 * Check which traits have complete PGS associations in the database
 * Uses normalized schema from trait_manifest.db
 */

export async function getCompletedTraits() {
  try {
    const conn = await getConnection();
    const result = await new Promise((resolve, reject) => {
      conn.all(`
        SELECT 
          t.trait_id,
          COUNT(DISTINCT tp.pgs_id) as pgs_count
        FROM traits t
        LEFT JOIN trait_pgs tp ON t.trait_id = tp.trait_id
        GROUP BY t.trait_id
        HAVING pgs_count > 0;
      `, (err, rows) => err ? reject(err) : resolve(rows));
    });
    
    const completed = {};
    for (const row of result) {
      completed[row.trait_id] = Number(row.pgs_count);
    }
    return completed;
  } catch (err) {
    console.log(`⚠️  Failed to get completed traits: ${err.message}`);
    return {};
  }
}

export async function getAllTraitMetadata() {
  try {
    const conn = await getConnection();
    const result = await new Promise((resolve, reject) => {
      conn.all(`
        SELECT 
          tp.trait_id,
          tp.pgs_id,
          ps.weight_type,
          ps.method_name,
          ps.norm_mean,
          ps.norm_sd,
          ps.variants_count
        FROM trait_pgs tp
        JOIN pgs_scores ps ON tp.pgs_id = ps.pgs_id;
      `, (err, rows) => err ? reject(err) : resolve(rows));
    });
    
    const metadata = {};
    for (const row of result) {
      if (!metadata[row.trait_id]) {
        metadata[row.trait_id] = {};
      }
      metadata[row.trait_id][row.pgs_id] = {
        weight_type: row.weight_type,
        method_name: row.method_name,
        norm_mean: row.norm_mean,
        norm_sd: row.norm_sd,
        variants_count: row.variants_count ? Number(row.variants_count) : null
      };
    }
    return metadata;
  } catch (err) {
    console.log(`⚠️  Failed to load metadata from database: ${err.message}`);
    return {};
  }
}

export async function getTraitMetadata(traitId) {
  try {
    const conn = await getConnection();
    const result = await new Promise((resolve, reject) => {
      conn.all(`
        SELECT 
          tp.pgs_id,
          ps.weight_type,
          ps.method_name,
          ps.norm_mean,
          ps.norm_sd,
          ps.variants_count
        FROM trait_pgs tp
        JOIN pgs_scores ps ON tp.pgs_id = ps.pgs_id
        WHERE tp.trait_id = ?;
      `, [traitId], (err, rows) => err ? reject(err) : resolve(rows));
    });
    
    const metadata = {};
    for (const row of result) {
      metadata[row.pgs_id] = {
        weight_type: row.weight_type,
        method_name: row.method_name,
        norm_mean: row.norm_mean,
        norm_sd: row.norm_sd,
        variants_count: row.variants_count ? Number(row.variants_count) : null
      };
    }
    return metadata;
  } catch (err) {
    console.log(`    Warning: Could not load metadata for ${traitId}: ${err.message}`);
    return {};
  }
}
