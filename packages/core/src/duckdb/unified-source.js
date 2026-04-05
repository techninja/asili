/**
 * Unified DNA source — SQL pushdown scoring via DuckDB WASM.
 * Loads imputed parquet into DuckDB table, JOINs against trait packs.
 * @module packages/core/src/duckdb/unified-source
 */

import * as ddb from './adapter.js';

let dnaLoaded = false;

/**
 * Load unified DNA parquet into DuckDB as _dna table.
 * @param {string} parquetPath - Virtual filename registered via registerBuffer
 * @returns {Promise<void>}
 */
export async function loadUnifiedDNA(parquetPath) {
  if (dnaLoaded) return;
  await ddb.query(
    `CREATE OR REPLACE TABLE _dna AS SELECT chr, pos, allele_key, variant_id AS user_variant_id, genotype_dosage, imputed, imputation_quality FROM '${parquetPath}'`
  );
  dnaLoaded = true;
}

/**
 * Score a trait via SQL pushdown — JOIN + GROUP BY entirely in DuckDB.
 * @param {string} traitUrl - URL/path to trait parquet
 * @returns {Promise<{pgsAggregates: Array, chrCoverage: Array}>}
 */
export async function scoreUnified(traitUrl) {
  await ddb.query(`
    CREATE OR REPLACE TEMP TABLE _matched AS
    SELECT t.pgs_id, t.chr, t.effect_weight,
           d.genotype_dosage AS dosage, d.imputed,
           t.effect_weight * d.genotype_dosage
             * CASE WHEN d.imputed AND d.imputation_quality IS NOT NULL
                    THEN SQRT(d.imputation_quality) ELSE 1.0 END
             AS contribution
    FROM '${traitUrl}' t
    INNER JOIN _dna d ON t.chr = d.chr AND t.pos = d.pos AND t.allele_key = d.allele_key
  `);

  const pgsAggregates = await ddb.query(`
    SELECT pgs_id, SUM(contribution) AS raw_score,
      COUNT(*) AS matched_variants,
      SUM(CASE WHEN imputed THEN 1 ELSE 0 END) AS imputed_variants,
      SUM(CASE WHEN NOT imputed THEN 1 ELSE 0 END) AS genotyped_variants,
      SUM(CASE WHEN contribution > 0 THEN 1 ELSE 0 END) AS positive_count,
      SUM(CASE WHEN contribution > 0 THEN contribution ELSE 0 END) AS positive_sum,
      SUM(CASE WHEN contribution < 0 THEN 1 ELSE 0 END) AS negative_count,
      SUM(CASE WHEN contribution < 0 THEN contribution ELSE 0 END) AS negative_sum,
      SUM(effect_weight * effect_weight) AS weight_sum_squared,
      MIN(effect_weight) AS weight_min, MAX(effect_weight) AS weight_max
    FROM _matched GROUP BY pgs_id
  `);

  const chrCoverage = await ddb.query(
    `SELECT pgs_id, chr, COUNT(*) AS cnt FROM _matched GROUP BY pgs_id, chr`
  );

  await ddb.query('DROP TABLE IF EXISTS _matched');
  return { pgsAggregates, chrCoverage };
}

/** Reset DNA loaded state (for switching individuals). */
export function resetUnifiedDNA() { dnaLoaded = false; }
