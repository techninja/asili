/**
 * Unified DNA source — SQL pushdown scoring via DuckDB WASM.
 * Scores one chromosome parquet at a time to keep memory bounded.
 * Uses Number() for all aggregate values to handle DuckDB BigInt returns.
 * @module packages/core/src/duckdb/unified-source
 */

import * as ddb from './adapter.js';

/** @type {string[]} */
let chrFiles = [];

/**
 * Set the chromosome parquet files for unified scoring.
 * @param {string[]} files - Virtual filenames of registered chromosome parquets
 */
export async function loadUnifiedDNA(files) {
  chrFiles = files;
}

/** @param {*} v @returns {number} */
const n = (v) => Number(v);

/**
 * Score a trait by JOINing against each chromosome parquet separately.
 * @param {string} traitUrl - URL/path to trait parquet
 * @param {Function} [onChr] - callback(chrDone, chrTotal) for sub-progress
 * @returns {Promise<{pgsAggregates: Array, chrCoverage: Array}>}
 */
export async function scoreUnified(traitUrl, onChr) {
  if (!chrFiles.length) throw new Error('Unified DNA not loaded');
  const pgsAgg = new Map();
  const chrCov = [];

  for (let ci = 0; ci < chrFiles.length; ci++) {
    if (onChr) onChr(ci, chrFiles.length);
    const chrFile = chrFiles[ci];
    const rows = await ddb.query(`
      SELECT t.pgs_id,
        SUM(t.effect_weight * d.genotype_dosage
          * CASE WHEN d.imputed AND d.imputation_quality IS NOT NULL
                 THEN SQRT(d.imputation_quality) ELSE 1.0 END) AS raw_score,
        COUNT(*) AS matched_variants,
        SUM(CASE WHEN d.imputed THEN 1 ELSE 0 END) AS imputed_variants,
        SUM(CASE WHEN NOT d.imputed THEN 1 ELSE 0 END) AS genotyped_variants,
        SUM(CASE WHEN t.effect_weight*d.genotype_dosage>0 THEN 1 ELSE 0 END) AS pos_count,
        SUM(CASE WHEN t.effect_weight*d.genotype_dosage>0
              THEN t.effect_weight*d.genotype_dosage ELSE 0 END) AS pos_sum,
        SUM(CASE WHEN t.effect_weight*d.genotype_dosage<0 THEN 1 ELSE 0 END) AS neg_count,
        SUM(CASE WHEN t.effect_weight*d.genotype_dosage<0
              THEN t.effect_weight*d.genotype_dosage ELSE 0 END) AS neg_sum,
        SUM(t.effect_weight * t.effect_weight) AS wsq
      FROM '${traitUrl}' t
      INNER JOIN '${chrFile}' d ON t.chr=d.chr AND t.pos=d.pos AND t.allele_key=d.allele_key
      GROUP BY t.pgs_id
    `);
    for (const r of rows) accumulate(pgsAgg, r);

    const cov = await ddb.query(`
      SELECT t.pgs_id, t.chr, COUNT(*) AS cnt
      FROM '${traitUrl}' t
      INNER JOIN '${chrFile}' d ON t.chr=d.chr AND t.pos=d.pos AND t.allele_key=d.allele_key
      GROUP BY t.pgs_id, t.chr
    `);
    chrCov.push(...cov);
  }
  return { pgsAggregates: [...pgsAgg.values()], chrCoverage: chrCov };
}

/** @param {Map} map @param {object} r */
function accumulate(map, r) {
  const pid = r.pgs_id;
  const e = map.get(pid);
  if (e) {
    e.raw_score += n(r.raw_score);
    e.matched_variants += n(r.matched_variants);
    e.imputed_variants += n(r.imputed_variants);
    e.genotyped_variants += n(r.genotyped_variants);
    e.positive_count += n(r.pos_count);
    e.positive_sum += n(r.pos_sum);
    e.negative_count += n(r.neg_count);
    e.negative_sum += n(r.neg_sum);
    e.weight_sum_squared += n(r.wsq);
  } else {
    map.set(pid, {
      pgs_id: pid, raw_score: n(r.raw_score),
      matched_variants: n(r.matched_variants), imputed_variants: n(r.imputed_variants),
      genotyped_variants: n(r.genotyped_variants),
      positive_count: n(r.pos_count), positive_sum: n(r.pos_sum),
      negative_count: n(r.neg_count), negative_sum: n(r.neg_sum),
      weight_sum_squared: n(r.wsq),
    });
  }
}

/**
 * Build finalize-compatible Maps from aggregate results.
 * @param {Array} pgsAggregates
 * @param {Array} chrCoverage
 * @returns {{pgsDetails: Map, pgsBreakdown: Map, totalMatches: number}}
 */
export function buildScoredMaps(pgsAggregates, chrCoverage) {
  const pgsDetails = new Map();
  const pgsBreakdown = new Map();
  let totalMatches = 0;
  for (const r of pgsAggregates) {
    const mv = n(r.matched_variants);
    pgsDetails.set(r.pgs_id, {
      score: n(r.raw_score), matchedVariants: mv,
      genotypedVariants: n(r.genotyped_variants), imputedVariants: n(r.imputed_variants),
      zScore: null, percentile: null, qualityScore: 0, topVariants: [], _topMinAbs: 0,
    });
    pgsBreakdown.set(r.pgs_id, {
      positive: n(r.positive_count), negative: n(r.negative_count),
      positiveSum: n(r.positive_sum), negativeSum: n(r.negative_sum),
      total: mv, weightSumSquared: n(r.weight_sum_squared), chromosomeCoverage: {},
      genotypedVariants: n(r.genotyped_variants), imputedVariants: n(r.imputed_variants),
    });
    totalMatches += mv;
  }
  for (const r of chrCoverage) {
    const bd = pgsBreakdown.get(r.pgs_id);
    if (bd) bd.chromosomeCoverage[r.chr] = Number(r.cnt);
  }
  return { pgsDetails, pgsBreakdown, totalMatches };
}

/** Reset chromosome files (for switching individuals). */
export function resetUnifiedDNA() { chrFiles = []; }
