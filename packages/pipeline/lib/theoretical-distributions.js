/**
 * Calculate theoretical PGS distributions from allele frequencies
 * Gold standard approach when empirical data has insufficient overlap
 */

export function calculateTheoreticalDistribution(weights, alleleFrequencies) {
  // Expected mean: E[PGS] = Σ(weight_i * 2 * af_i)
  const mean = weights.reduce((sum, weight, i) => {
    const af = alleleFrequencies[i] || 0;
    return sum + weight * 2 * af;
  }, 0);

  // Variance: Var[PGS] = Σ(weight_i² * 2 * af_i * (1 - af_i))
  // Assumes Hardy-Weinberg equilibrium and linkage equilibrium
  const variance = weights.reduce((sum, weight, i) => {
    const af = alleleFrequencies[i] || 0;
    return sum + weight * weight * 2 * af * (1 - af);
  }, 0);

  const sd = Math.sqrt(variance);

  return { mean, sd, variance };
}

export function calculatePercentiles(mean, sd, numPoints = 100) {
  // Generate percentile values assuming normal distribution
  const percentiles = [];
  for (let p = 1; p <= numPoints; p++) {
    const z = inverseNormalCDF(p / 100);
    percentiles.push(mean + z * sd);
  }
  return percentiles;
}

function inverseNormalCDF(p) {
  // Approximation of inverse normal CDF (z-score from percentile)
  const a = [
    -3.969683028665376e1, 2.209460984245205e2,
    -2.759285104469687e2, 1.383577518672690e2,
    -3.066479806614716e1, 2.506628277459239
  ];
  const b = [
    -5.447609879822406e1, 1.615858368580409e2,
    -1.556989798598866e2, 6.680131188771972e1,
    -1.328068155288572e1
  ];
  const c = [
    -7.784894002430293e-3, -3.223964580411365e-1,
    -2.400758277161838, -2.549732539343734,
    4.374664141464968, 2.938163982698783
  ];
  const d = [
    7.784695709041462e-3, 3.224671290700398e-1,
    2.445134137142996, 3.754408661907416
  ];

  const pLow = 0.02425;
  const pHigh = 1 - pLow;

  if (p < pLow) {
    const q = Math.sqrt(-2 * Math.log(p));
    return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
      ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  }

  if (p <= pHigh) {
    const q = p - 0.5;
    const r = q * q;
    return (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q /
      (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
  }

  const q = Math.sqrt(-2 * Math.log(1 - p));
  return -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
    ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
}
