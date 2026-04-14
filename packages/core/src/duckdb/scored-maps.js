/**
 * Build finalize-compatible Maps from SQL aggregate results.
 * Pure data transformation — no DuckDB dependency.
 * @module packages/core/src/duckdb/scored-maps
 */

/** @param {*} v @returns {number} */
const n = (v) => Number(v);

/**
 * @param {Array} pgsAggregates
 * @param {Array} chrCoverage
 * @param {Array} [chrTotals]
 * @returns {{pgsDetails: Map, pgsBreakdown: Map, totalMatches: number}}
 */
export function buildScoredMaps(pgsAggregates, chrCoverage, chrTotals = []) {
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
      total: mv, weightSumSquared: n(r.weight_sum_squared),
      chromosomeCoverage: {}, chromosomeTotals: {},
      genotypedVariants: n(r.genotyped_variants), imputedVariants: n(r.imputed_variants),
    });
    totalMatches += mv;
  }
  for (const r of chrCoverage) {
    const bd = pgsBreakdown.get(r.pgs_id);
    if (bd) bd.chromosomeCoverage[r.chr] = Number(r.cnt);
  }
  for (const r of chrTotals) {
    const bd = pgsBreakdown.get(r.pgs_id);
    if (bd) bd.chromosomeTotals[r.chr] = Number(r.cnt);
  }
  return { pgsDetails, pgsBreakdown, totalMatches };
}
