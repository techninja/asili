/**
 * PGS calculation pure functions.
 * Z-score, percentile, confidence, quality score, theoretical SD.
 * @module packages/core/src/calculator
 */

const MIN_VARIANT_THRESHOLD = 8;
const DEFAULT_R2 = 0.05;

/**
 * @param {number} rawScore
 * @param {{mean: number, sd: number}} stats
 * @returns {number|null}
 */
export function calculateZScore(rawScore, stats) {
  if (!stats || stats.mean == null || !stats.sd) return null;
  return (rawScore - stats.mean) / stats.sd;
}

/**
 * Standard normal CDF via error function approximation.
 * @param {number} zScore
 * @returns {number|null} Percentile 0-100
 */
export function calculatePercentile(zScore) {
  if (zScore == null) return null;
  const sign = zScore >= 0 ? 1 : -1;
  const x = Math.abs(zScore / Math.sqrt(2));
  const t = 1.0 / (1.0 + 0.3275911 * x);
  const y =
    1.0 -
    ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t -
      0.284496736) * t + 0.254829592) * t * Math.exp(-x * x);
  return 0.5 * (1 + sign * y) * 100;
}

/**
 * @param {number} weightSumSquared - Σ(w²)
 * @param {number} count
 * @returns {number}
 */
export function estimateTheoreticalSD(weightSumSquared, count) {
  if (!count) return 1.0;
  return Math.sqrt(weightSumSquared * 0.5);
}

/**
 * @param {number} matchedVariants
 * @returns {'none'|'insufficient'|'low'|'medium'|'high'}
 */
export function calculateConfidence(matchedVariants) {
  if (matchedVariants === 0) return 'none';
  if (matchedVariants < MIN_VARIANT_THRESHOLD) return 'insufficient';
  if (matchedVariants < 10) return 'low';
  if (matchedVariants < 100) return 'medium';
  return 'high';
}

/**
 * Quality score (0-100) ranking PGS by validity + data quality.
 * See docs/app-spec/PGS_QUALITY_SCORE.md for full formula.
 * @param {number} matched
 * @param {number} total
 * @param {number} performanceMetric - R² value
 * @param {boolean} hasNormalization
 * @param {number|null} zScore
 * @param {number} genotypedVariants
 * @returns {number}
 */
export function calculateQualityScore(
  matched, total, performanceMetric,
  hasNormalization = true, zScore = null, genotypedVariants = 0
) {
  if (matched === 0 || !total) return 0;

  const coverage = Math.min(matched / total, 1);
  const r2 = performanceMetric || DEFAULT_R2;
  const hasValidatedR2 = performanceMetric && performanceMetric > DEFAULT_R2;
  const genotypedRatio = matched > 0 ? genotypedVariants / matched : 0;

  let coveragePenalty = 1.0;
  if (coverage < 0.05) coveragePenalty = (coverage / 0.05) ** 2;
  else if (coverage < 0.2) coveragePenalty = Math.sqrt(coverage / 0.2);

  const performance = r2 * 35 * coveragePenalty;
  const validation = hasValidatedR2 ? Math.min(r2 / 0.44, 1) * 15 : 0;
  const reliability = genotypedRatio * 15;
  const coverageScore = coverage * 10;
  const sampleRatio = Math.max(matched / MIN_VARIANT_THRESHOLD, 1);
  const sample = Math.min(Math.log10(sampleRatio) / 3.1, 1) * 10;
  const normalization = hasNormalization ? 5 : 2.5;

  let signal = 0;
  if (zScore != null && !isNaN(zScore)) {
    const absZ = Math.abs(zScore);
    signal = absZ > 5 ? 0 : Math.min(absZ / 3, 1) * 10;
  }

  const raw = performance + validation + reliability +
    coverageScore + sample + normalization + signal;
  return Math.round(raw * 10000) / 10000;
}

export { MIN_VARIANT_THRESHOLD, DEFAULT_R2 };
