/**
 * Unified DNA source — SQL pushdown scoring via DuckDB WASM.
 * Scores one chromosome parquet at a time to keep memory bounded.
 * Uses Number() for all aggregate values to handle DuckDB BigInt returns.
 * @module packages/core/src/duckdb/unified-source
 */

import * as ddb from './adapter.js';

/** @type {string[]} */
let chrFiles = [];

/** Table names start with _ (from loadGenotypedDNA), file names get quoted */
const ref = (name) => name.startsWith('_') ? name : `'${name}'`;

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
    const chrNum = dnaChr.replace(/[^0-9]/g, '');
    const traitChr = traitChrFiles.get(chrNum);
    if (!traitChr) continue;
    const dnaRef = ref(dnaChr);
    // Oriented dosage: genotype_dosage is alt-allele count. If effect_allele
    // is the ref (LEAST), flip to 2-dosage. CTE computes contribution once.
    const rows = await ddb.query(`
      WITH m AS (
        SELECT t.pgs_id, t.effect_weight, d.imputed, d.imputation_quality,
          t.effect_weight
            * CASE WHEN t.effect_allele = GREATEST(
                     SPLIT_PART(t.variant_id,':',3), SPLIT_PART(t.variant_id,':',4))
                   THEN d.genotype_dosage ELSE 2.0 - d.genotype_dosage END
            * CASE WHEN d.imputed AND d.imputation_quality IS NOT NULL
                   THEN SQRT(d.imputation_quality) ELSE 1.0 END
            AS contribution
        FROM '${traitChr}' t
        INNER JOIN ${dnaRef} d ON t.pos=d.pos AND t.allele_key=d.allele_key
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
        SUM(effect_weight * effect_weight) AS wsq
      FROM m GROUP BY pgs_id
    `);
    for (const r of rows) {
      accumulate(pgsAgg, r);
      matchedSoFar += Number(r.matched_variants) || 0;
    }
    const cov = await ddb.query(`
      SELECT t.pgs_id, '${chrNum}' as chr, COUNT(*) AS cnt
      FROM '${traitChr}' t
      INNER JOIN ${dnaRef} d ON t.pos=d.pos AND t.allele_key=d.allele_key
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

/** @param {Map} map @param {object} r */
function accumulate(map, r) {
  const pid = r.pgs_id, e = map.get(pid);
  if (e) {
    e.raw_score += n(r.raw_score); e.matched_variants += n(r.matched_variants);
    e.imputed_variants += n(r.imputed_variants); e.genotyped_variants += n(r.genotyped_variants);
    e.positive_count += n(r.pos_count); e.positive_sum += n(r.pos_sum);
    e.negative_count += n(r.neg_count); e.negative_sum += n(r.neg_sum);
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


/** Reset chromosome files (for switching individuals). */
export function resetUnifiedDNA() { chrFiles = []; }
