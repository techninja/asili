/**
 * PGS Scorer — accumulates per-PGS scores from matched variants.
 * Consumes matchVariants iterator from any DNA source.
 * @module packages/core/src/scorer
 */

import { normalizePGS, selectBestPGS } from './normalizer.js';
import { calculatePercentile } from './calculator.js';

/** @returns {{ details: object, breakdown: object }} Fresh PGS accumulators */
function createPGSAccumulators() {
  return {
    details: {
      score: 0, matchedVariants: 0, genotypedVariants: 0,
      imputedVariants: 0, zScore: null, percentile: null,
      qualityScore: 0, topVariants: [], _topMinAbs: 0,
    },
    breakdown: {
      positive: 0, negative: 0, positiveSum: 0, negativeSum: 0,
      total: 0, weightSumSquared: 0, chromosomeCoverage: {},
      genotypedVariants: 0, imputedVariants: 0,
    },
  };
}

/**
 * Score all PGS for a trait from an async match iterator.
 * @param {AsyncIterable<Array>} matchIterator - yields batches of matches
 * @param {Map<string, number>} pgsVariantCounts - total variants per PGS
 * @returns {{ pgsDetails: Map, pgsBreakdown: Map, totalMatches: number }}
 */
export async function scoreFromMatches(matchIterator, pgsVariantCounts) {
  const pgsDetails = new Map();
  const pgsBreakdown = new Map();
  let totalMatches = 0;

  for await (const batch of matchIterator) {
    for (const m of batch) {
      const pgsId = m.pgs_id;
      if (!pgsDetails.has(pgsId)) {
        const acc = createPGSAccumulators();
        pgsDetails.set(pgsId, acc.details);
        pgsBreakdown.set(pgsId, acc.breakdown);
      }
      const details = pgsDetails.get(pgsId);
      const breakdown = pgsBreakdown.get(pgsId);
      const weight = +m.effect_weight || 0;
      const dosage = m.dosage ?? m.genotype_dosage;
      const contribution = weight * dosage;
      const isImputed = m.imputed === true || m.imputed === 1;
      const chr = m.variant_id?.split(':', 1)[0] || '?';

      if (contribution > 0) { breakdown.positive++; breakdown.positiveSum += contribution; }
      else if (contribution < 0) { breakdown.negative++; breakdown.negativeSum += contribution; }

      breakdown.total++;
      breakdown.weightSumSquared += weight * weight;
      breakdown.chromosomeCoverage[chr] = (breakdown.chromosomeCoverage[chr] || 0) + 1;

      details.score += contribution;
      details.matchedVariants++;
      totalMatches++;

      if (isImputed) { breakdown.imputedVariants++; details.imputedVariants++; }
      else { breakdown.genotypedVariants++; details.genotypedVariants++; }
    }
  }

  return { pgsDetails, pgsBreakdown, totalMatches };
}

/**
 * Finalize scored PGS — normalize, select best, produce trait result.
 * @param {object} scored - output of scoreFromMatches
 * @param {object} normParams - keyed by pgsId: { norm_mean, norm_sd, ... }
 * @param {object} opts - { traitType, phenotypeMean, phenotypeSd, pgsPerformance }
 * @returns {object} Trait-level result
 */
export function finalize(scored, normParams = {}, opts = {}) {
  const { pgsDetails, pgsBreakdown, totalMatches } = scored;
  const { traitType, phenotypeMean, phenotypeSd, pgsPerformance = {} } = opts;

  for (const [pgsId, details] of pgsDetails) {
    const breakdown = pgsBreakdown.get(pgsId);
    const np = normParams[pgsId] || {};
    np.variants_number = np.variants_number || breakdown.total;
    normalizePGS(details, breakdown, np, traitType, phenotypeMean, phenotypeSd,
      pgsPerformance[pgsId]);
  }

  const bestId = selectBestPGS(pgsDetails);
  const best = bestId ? pgsDetails.get(bestId) : null;

  const result = {
    zScore: best?.zScore ?? null,
    percentile: best?.percentile ?? null,
    confidence: best?.confidence ?? 'none',
    bestPGS: bestId,
    bestPGSQualityScore: best?.qualityScore ?? 0,
    totalMatches,
    pgsDetails: Object.fromEntries(pgsDetails),
    pgsBreakdown: Object.fromEntries(pgsBreakdown),
  };

  if (traitType === 'quantitative' && best?.value != null) {
    result.value = best.value;
  }

  return result;
}
