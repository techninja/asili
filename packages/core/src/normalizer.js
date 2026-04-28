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
const MAX_Z = 4;

/**
 * Normalize a single PGS result. Mutates `details` in place.
 * @param {object} details @param {object} breakdown @param {object} normParams
 * @param {string} traitType @param {number|null} phenotypeMean
 * @param {number|null} phenotypeSd @param {object|null} perfMetrics
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

  // Scale empirical norm params by coverage: at partial coverage the expected
  // score is proportionally smaller (mean × cov) and variance scales with
  // the fraction of variants scored (SD × √cov).
  if (useEmpirical && coverage < 1.0 && mean !== undefined) {
    mean = mean * coverage;
    sd = sd * Math.sqrt(coverage);
  }

  // The norm params were computed from genotyped reference individuals.
  // Imputed scoring applies √(R²) per variant, which:
  //   1. Shrinks the mean proportionally (mean × avgShrinkage)
  //   2. Compresses dosage variance more aggressively — imputed dosages
  //      are posterior means that cluster toward het, reducing score spread.
  //      SD scales by shrinkage² (approximating the R² variance reduction).
  const shrinkage = details.avgShrinkage || 1.0;
  if (useEmpirical && mean !== undefined && shrinkage < 1.0) {
    mean = mean * shrinkage;
    sd = sd * shrinkage * shrinkage;
  }

  // Sanity check: if scaled z would be extreme, the empirical norms may not
  // match our scoring method — fall back to theoretical SD.
  if (useEmpirical && mean !== undefined && sd > 0) {
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
    let z = calculateZScore(details.score, { mean, sd });
    // Clamp to ±4σ — extreme values indicate norm param mismatch, not real signal.
    // TODO: remove clamp once norm params are recomputed with correct orientation.
    if (z !== null && Math.abs(z) > MAX_Z) z = Math.sign(z) * MAX_Z;
    details.zScore = z;
    details.percentile = calculatePercentile(z);
    details.qualityScore = calculateQualityScore(
      details.matchedVariants, totalVariants, perfWeight,
      hasGoodNorm, z, details.genotypedVariants
    );
    if (traitType === 'quantitative' && phenotypeMean !== null
      && phenotypeMean !== undefined && phenotypeSd !== null
      && phenotypeSd !== undefined) {
      const r2 = perfMetrics?.r2 || perfWeight;
      details.value = phenotypeMean + z * Math.sqrt(r2) * phenotypeSd;
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
