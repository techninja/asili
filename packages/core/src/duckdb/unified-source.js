/**
 * Unified DNA source — SQL pushdown scoring via DuckDB WASM.
 * Scores one chromosome parquet at a time to keep memory bounded.
 * Uses Number() for all aggregate values to handle DuckDB BigInt returns.
 * @module packages/core/src/duckdb/unified-source
 */
import * as ddb from './adapter.js';
import { accumulate } from './accumulate.js';
/** @type {string[]} */
let chrFiles = [];

const ref = (name) => name.startsWith('_') ? name : `'${name}'`;
/**
 * Set the chromosome parquet files for unified scoring.
 * @param {string[]} files - Virtual filenames of registered chromosome parquets
 */
export async function loadUnifiedDNA(files) {
  chrFiles = files;
}
/** @param {*} v @returns {number} */
/**
 * Score a trait by JOINing per-chromosome trait packs against DNA chromosomes.
 * @param {Map<string, string>} traitChrFiles - chr number → registered trait file name
 * @param {Function} [onChr] - callback(chrDone, chrTotal, matchedSoFar)
 * @returns {Promise<{pgsAggregates: Array, chrCoverage: Array, chrTotals: Array}>}
 */
export async function scoreUnifiedChrPacks(traitChrFiles, onChr) {
  if (!chrFiles.length) throw new Error('Unified DNA not loaded');
  const pgsAgg = new Map();
  const chrCov = [];
  const chrTot = [];
  let matchedSoFar = 0;
  const total = chrFiles.length;
  for (let ci = 0; ci < total; ci++) {
    if (onChr) onChr(ci, total, matchedSoFar);
    const dnaChr = chrFiles[ci];
    const chrNum = dnaChr.match(/chr(\d+)/)?.[1] || dnaChr.replace(/[^0-9]/g, '');
    const traitChr = traitChrFiles.get(chrNum);
    if (!traitChr) continue;
    const dnaRef = ref(dnaChr);
    // Orientation: for imputed parquets (file paths), dosage counts the ALT allele
    // (4th field of variant_id). For genotyped tables, dosage counts GREATEST allele.
    const isFile = !dnaChr.startsWith('_');
    const orientExpr = isFile
      ? `CASE WHEN t.effect_allele = SPLIT_PART(d.variant_id,':',4)
              THEN d.genotype_dosage ELSE 2.0 - d.genotype_dosage END`
      : `CASE WHEN t.effect_allele = GREATEST(
              SPLIT_PART(t.variant_id,':',3), SPLIT_PART(t.variant_id,':',4))
              THEN d.genotype_dosage ELSE 2.0 - d.genotype_dosage END`;
    // Dosage centering: subtract expected_dosage (2*AF) for imputed variants.
    // expected_dosage stores 2*AF for ALT allele; flip it when dosage is flipped.
    const centerExpr = isFile
      ? `CASE WHEN d.imputed THEN
              CASE WHEN t.effect_allele = SPLIT_PART(d.variant_id,':',4)
                   THEN COALESCE(d.expected_dosage, 0.0)
                   ELSE 2.0 - COALESCE(d.expected_dosage, 0.0) END
            ELSE 0.0 END`
      : '0.0';
    // DR2 filter: pre-filter DNA to exclude imputed variants with DR2 < 0.3.
    // sqrt(DR2) shrinkage downweights remaining imputed variants proportionally.
    const dnaExpr = isFile
      ? `(SELECT * FROM ${dnaRef} WHERE (NOT imputed) OR (imputation_quality >= 0.3))`
      : dnaRef;
    const rows = await ddb.query(`
      WITH m AS (
        SELECT t.pgs_id, t.effect_weight, d.imputed, d.imputation_quality,
          t.effect_weight * (${orientExpr} - ${centerExpr})
            * CASE WHEN d.imputed AND d.imputation_quality IS NOT NULL
                   THEN SQRT(d.imputation_quality) ELSE 1.0 END
            AS contribution,
          ${isFile
            ? `CASE WHEN d.imputed
                    THEN COALESCE(d.expected_dosage, 0.0) * (1.0 - COALESCE(d.expected_dosage, 0.0) / 2.0)
                         * COALESCE(d.imputation_quality, 1.0)
                    ELSE 0.5 END`
            : '0.5'}
            AS dosage_variance
        FROM '${traitChr}' t
        INNER JOIN ${dnaExpr} d ON t.pos=d.pos AND t.allele_key=d.allele_key
      )
      SELECT pgs_id,
        SUM(contribution) AS raw_score,
        COUNT(*) AS matched_variants,
        SUM(CASE WHEN imputed THEN 1 ELSE 0 END) AS imputed_variants,
        SUM(CASE WHEN NOT imputed THEN 1 ELSE 0 END) AS genotyped_variants,
        SUM(CASE WHEN contribution>0 THEN 1 ELSE 0 END) AS pos_count,
        SUM(CASE WHEN contribution>0 THEN contribution ELSE 0 END) AS pos_sum,
        SUM(CASE WHEN contribution<0 THEN 1 ELSE 0 END) AS neg_count,
        SUM(CASE WHEN contribution<0 THEN contribution ELSE 0 END) AS neg_sum,
        SUM(effect_weight * effect_weight * dosage_variance) AS wsq,
        AVG(CASE WHEN imputed AND imputation_quality IS NOT NULL
             THEN SQRT(imputation_quality) ELSE 1.0 END) AS avg_shrinkage
      FROM m GROUP BY pgs_id
    `);
    for (const r of rows) {
      accumulate(pgsAgg, r);
      matchedSoFar += Number(r.matched_variants) || 0;
    }
    const cov = await ddb.query(`
      SELECT t.pgs_id, '${chrNum}' as chr, COUNT(*) AS cnt,
        SUM(t.effect_weight * (${orientExpr} - ${centerExpr})
          * CASE WHEN d.imputed AND d.imputation_quality IS NOT NULL
                 THEN SQRT(d.imputation_quality) ELSE 1.0 END
        ) AS chr_contribution,
        SUM(CASE WHEN d.imputed THEN 1 ELSE 0 END) AS chr_imputed
      FROM '${traitChr}' t
      INNER JOIN ${dnaExpr} d ON t.pos=d.pos AND t.allele_key=d.allele_key
      GROUP BY t.pgs_id
    `);
    chrCov.push(...cov);
    // Total variants per PGS per chr (no DNA join — just trait pack counts)
    const tot = await ddb.query(`
      SELECT pgs_id, '${chrNum}' as chr, COUNT(*) AS cnt
      FROM '${traitChr}' GROUP BY pgs_id
    `);
    chrTot.push(...tot);
  }
  return { pgsAggregates: [...pgsAgg.values()], chrCoverage: chrCov, chrTotals: chrTot };
}
/**
 *
 */
export function getChrFiles() { return chrFiles; }
/**
 *
 */
export async function resetUnifiedDNA() {
  for (const f of chrFiles) {
    try { await ddb.dropFile(f); } catch { /* may not exist */ }
  }
  chrFiles = [];
  // Settle time — DuckDB needs a moment to fully release file handles
  await new Promise((r) => setTimeout(r, 300));
}
