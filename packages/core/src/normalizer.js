/**
 * PGS normalization and best-PGS selection.
 * Applies z-score normalization per PGS, selects best result for a trait.
 * @module packages/core/src/normalizer
 */

import {
  calculateZScore, calculatePercentile, estimateTheoreticalSD,
  calculateConfidence, calculateQualityScore,
  MIN_VARIANT_THRESHOLD, DEFAULT_R2,
} from './calculator.js';

const MIN_COVERAGE = 0.05;

/**
 * Normalize a single PGS result. Mutates `details` in place.
 * @param {object} details - PGS details (score, matchedVariants, etc.)
 * @param {object} breakdown - PGS breakdown accumulators
 * @param {object} normParams - { norm_mean, norm_sd, performance_weight, variants_number }
 * @param {string} traitType
 * @param {number|null} phenotypeMean
 * @param {number|null} phenotypeSd
 * @param {object|null} perfMetrics - { r2 } from pgs_performance
 */
export function normalizePGS(
  details, breakdown, normParams,
  traitType = 'disease_risk', phenotypeMean = null, phenotypeSd = null,
  perfMetrics = null
) {
  const totalVariants = normParams.variants_number || breakdown.total || 0;
  const coverage = totalVariants > 0 ? details.matchedVariants / totalVariants : 0;
  const perfWeight = normParams.performance_weight ?? DEFAULT_R2;

  let mean = normParams.norm_mean ?? undefined;
  let sd = normParams.norm_sd ?? undefined;
  const hasEmpirical = sd !== undefined && sd > 0;
  const sufficientCoverage = coverage >= MIN_COVERAGE;
  let useEmpirical = hasEmpirical && sufficientCoverage;

  // Scale empirical norm params by coverage when partial.
  // At high coverage (≥80%), the population distribution is close enough
  // to the reference that scaling introduces more error than it corrects.
  // At moderate coverage (5–80%), scale linearly: mean × coverage, SD × √coverage.
  // This prevents tiny SDs from producing extreme z-scores at near-full coverage.
  if (useEmpirical && coverage < 0.8 && mean !== undefined) {
    mean = mean * coverage;
    sd = sd * Math.sqrt(coverage);
  }

  if (useEmpirical && coverage < 0.8 && mean !== undefined && mean !== 0) {
    const naiveZ = Math.abs((details.score - mean) / sd);
    if (naiveZ > 20) useEmpirical = false;
  }

  if (!useEmpirical && breakdown.total > 0) {
    mean = 0;
    sd = estimateTheoreticalSD(breakdown.weightSumSquared, breakdown.total);
  }

  details.confidence = calculateConfidence(details.matchedVariants);
  details.insufficientData = details.matchedVariants < MIN_VARIANT_THRESHOLD;
  details.coverage = coverage;
  details.performanceMetric = perfWeight;
  details.normMean = mean;
  details.normSd = sd;

  const hasGoodNorm = hasEmpirical && sufficientCoverage;
  if (mean !== undefined && sd !== undefined && sd > 0 && details.matchedVariants > 0) {
    details.zScore = calculateZScore(details.score, { mean, sd });
    details.percentile = calculatePercentile(details.zScore);
    details.qualityScore = calculateQualityScore(
      details.matchedVariants, totalVariants, perfWeight,
      hasGoodNorm, details.zScore, details.genotypedVariants
    );
    if (traitType === 'quantitative' && phenotypeMean !== null && phenotypeMean !== undefined && phenotypeSd !== null && phenotypeSd !== undefined) {
      const r2 = perfMetrics?.r2 || perfWeight;
      details.value = phenotypeMean + details.zScore * Math.sqrt(r2) * phenotypeSd;
    }
  } else {
    details.zScore = null;
    details.percentile = null;
    details.qualityScore = calculateQualityScore(
      details.matchedVariants, totalVariants, perfWeight,
      hasGoodNorm, null, details.genotypedVariants
    );
  }
}

/**
 * Select the best PGS from a map of finalized details.
 * @param {Map<string, object>} pgsDetails
 * @returns {string|null} Best PGS ID
 */
export function selectBestPGS(pgsDetails) {
  let bestId = null;
  let bestScore = 0;

  for (const [id, d] of pgsDetails) {
    if (d.insufficientData) continue;
    if (d.zScore !== null && d.zScore !== undefined && Math.abs(d.zScore) > 5) continue;
    if (d.qualityScore > bestScore) {
      bestScore = d.qualityScore;
      bestId = id;
    }
  }

  if (!bestId) {
    for (const [id, d] of pgsDetails) {
      if (d.qualityScore > bestScore && d.zScore !== null && d.zScore !== undefined) {
        bestScore = d.qualityScore;
        bestId = id;
      }
    }
  }

  return bestId;
}
