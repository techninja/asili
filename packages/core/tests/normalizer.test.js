import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { normalizePGS, selectBestPGS } from '../src/normalizer.js';

/** @returns {{ details: object, breakdown: object }} */
function makePGS(overrides = {}) {
  return {
    details: {
      score: 0, matchedVariants: 0, genotypedVariants: 0,
      imputedVariants: 0, zScore: null, percentile: null,
      qualityScore: 0, topVariants: [], ...overrides,
    },
    breakdown: {
      positive: 0, negative: 0, positiveSum: 0, negativeSum: 0,
      total: overrides.matchedVariants || 0, weightSumSquared: 0.01,
      chromosomeCoverage: {}, genotypedVariants: 0, imputedVariants: 0,
      varianceIncluded: false,
    },
  };
}

describe('normalizePGS', () => {
  it('raw data always uses theoretical SD (skips empirical)', () => {
    const { details, breakdown } = makePGS({
      score: 0.001, matchedVariants: 150, genotypedVariants: 150, imputedVariants: 0,
    });
    breakdown.total = 150;
    breakdown.weightSumSquared = 0.04;
    const np = {
      norm_mean: 0.5, norm_sd: 0.2, variants_number: 1000,
      tiers: { raw: { m: 0.06, s: 0.07 }, imputed: { m: 0.3, s: 0.14 } },
    };
    normalizePGS(details, breakdown, np);

    // Raw data → theoretical: mean=0, sd=sqrt(wsq*0.5)
    assert.equal(details.normMean, 0);
    assert.ok(Math.abs(details.normSd - Math.sqrt(0.02)) < 1e-6);
  });

  it('uses tiered norms for imputed data when tiers available', () => {
    const { details, breakdown } = makePGS({
      score: 0.2, matchedVariants: 600, genotypedVariants: 100, imputedVariants: 500,
    });
    breakdown.total = 600;
    const np = {
      norm_mean: 0.5, norm_sd: 0.2, variants_number: 1000,
      tiers: { raw: { m: 0.06, s: 0.07 }, imputed: { m: 0.3, s: 0.14 } },
    };
    normalizePGS(details, breakdown, np);

    assert.equal(details.normMean, 0.3);
    assert.equal(details.normSd, 0.14);
  });

  it('imputed without tiers falls back to coverage scaling', () => {
    const { details, breakdown } = makePGS({
      score: 0.08, matchedVariants: 150, genotypedVariants: 50, imputedVariants: 100,
    });
    breakdown.total = 150;
    const np = { norm_mean: 0.5, norm_sd: 0.2, variants_number: 1000 };
    // coverage = 150/1000 = 0.15, shrinkage defaults to 1.0
    normalizePGS(details, breakdown, np);

    const cov = 0.15;
    assert.ok(Math.abs(details.normMean - 0.5 * cov) < 1e-6);
    const expectedSd = 0.2 * Math.sqrt(cov);
    assert.ok(Math.abs(details.normSd - expectedSd) < 1e-6);
  });

  it('falls back to theoretical when no empirical data', () => {
    const { details, breakdown } = makePGS({
      score: 0.5, matchedVariants: 50,
    });
    breakdown.total = 50;
    breakdown.weightSumSquared = 0.1;

    normalizePGS(details, breakdown, {});

    assert.equal(details.normMean, 0);
    assert.ok(Math.abs(details.normSd - Math.sqrt(0.05)) < 1e-5);
    assert.ok(details.zScore !== null);
  });

  it('falls back to theoretical when coverage < 5%', () => {
    const { details, breakdown } = makePGS({
      score: 0.01, matchedVariants: 300, imputedVariants: 200, genotypedVariants: 100,
    });
    breakdown.total = 300;
    breakdown.weightSumSquared = 0.001;
    const np = { norm_mean: 1.0, norm_sd: 0.5, variants_number: 10000 };

    normalizePGS(details, breakdown, np);

    assert.equal(details.normMean, 0);
  });

  it('sanity check rejects extreme z from tier norms', () => {
    const { details, breakdown } = makePGS({
      score: 5.0, matchedVariants: 600, genotypedVariants: 100, imputedVariants: 500,
    });
    breakdown.total = 600;
    breakdown.weightSumSquared = 1.0;
    breakdown.varianceIncluded = true;
    // Tier SD is tiny → would produce |z| > 4 → fallback to theoretical
    const np = {
      norm_mean: 0.5, norm_sd: 0.2, variants_number: 1000,
      tiers: { imputed: { m: 0.0, s: 0.001 } },
    };
    normalizePGS(details, breakdown, np);

    // Should fall back to theoretical (mean=0)
    assert.equal(details.normMean, 0);
    assert.ok(Math.abs(details.zScore) < 10);
  });

  it('computes quantitative trait value for imputed data', () => {
    const { details, breakdown } = makePGS({
      score: 1.0, matchedVariants: 500, genotypedVariants: 50, imputedVariants: 450,
    });
    breakdown.total = 500;
    breakdown.weightSumSquared = 1;
    const np = { norm_mean: 0, norm_sd: 1, variants_number: 500 };

    normalizePGS(details, breakdown, np, 'quantitative', 25.0, 4.0, { r2: 0.25 });

    // z = (1.0 - 0) / 1 = 1.0, value = 25 + 1.0 * sqrt(0.25) * 4 = 25 + 2 = 27
    assert.ok(Math.abs(details.value - 27.0) < 0.1);
  });
});

describe('selectBestPGS', () => {
  it('selects highest quality score', () => {
    const map = new Map([
      ['A', { qualityScore: 30, zScore: 1, insufficientData: false }],
      ['B', { qualityScore: 60, zScore: 1, insufficientData: false }],
    ]);
    assert.equal(selectBestPGS(map), 'B');
  });

  it('skips insufficient data', () => {
    const map = new Map([
      ['A', { qualityScore: 90, zScore: 1, insufficientData: true }],
      ['B', { qualityScore: 30, zScore: 1, insufficientData: false }],
    ]);
    assert.equal(selectBestPGS(map), 'B');
  });

  it('falls back to extreme z when all are insufficient', () => {
    const map = new Map([
      ['A', { qualityScore: 50, zScore: 10, insufficientData: true }],
    ]);
    assert.equal(selectBestPGS(map), 'A');
  });
});

describe('imputation shrinkage (legacy fallback without tiers)', () => {
  it('100% coverage imputed → no scaling applied', () => {
    const { details, breakdown } = makePGS({
      score: 0.4, matchedVariants: 100, genotypedVariants: 0,
      imputedVariants: 100, avgShrinkage: 0.95,
    });
    breakdown.total = 100;
    const np = { norm_mean: 0.5, norm_sd: 0.2, variants_number: 100 };
    normalizePGS(details, breakdown, np);
    assert.ok(Math.abs(details.normMean - 0.5) < 1e-6);
    assert.ok(Math.abs(details.normSd - 0.2) < 1e-6);
  });

  it('shrinkage + coverage scaling compound correctly for imputed', () => {
    // 50% coverage + 0.95 shrinkage
    const { details, breakdown } = makePGS({
      score: 0.2, matchedVariants: 50, genotypedVariants: 0,
      imputedVariants: 50, avgShrinkage: 0.95,
    });
    breakdown.total = 50;
    const np = { norm_mean: 0.5, norm_sd: 0.2, variants_number: 100 };
    normalizePGS(details, breakdown, np);
    const sMean = 0.5 * 0.5 * 0.95;
    const sSd = 0.2 * Math.sqrt(0.5) / 0.95;
    assert.ok(Math.abs(details.normMean - sMean) < 1e-6);
    assert.ok(Math.abs(details.normSd - sSd) < 1e-6);
  });
});
