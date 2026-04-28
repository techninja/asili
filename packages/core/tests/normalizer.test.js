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
    },
  };
}

describe('normalizePGS', () => {
  it('scales empirical stats by coverage', () => {
    const { details, breakdown } = makePGS({
      score: 0.08, matchedVariants: 150, genotypedVariants: 100,
    });
    breakdown.total = 150;
    const np = { norm_mean: 0.5, norm_sd: 0.2, variants_number: 1000 };
    // coverage = 150/1000 = 0.15
    // scaled_mean = 0.5 * 0.15 = 0.075, scaled_sd = 0.2 * sqrt(0.15)
    normalizePGS(details, breakdown, np);

    const cov = 0.15;
    assert.equal(details.normMean, 0.5 * cov);
    const expectedSd = 0.2 * Math.sqrt(cov);
    assert.ok(Math.abs(details.normSd - expectedSd) < 1e-6);
    const expectedZ = (0.08 - 0.5 * cov) / expectedSd;
    assert.ok(Math.abs(details.zScore - expectedZ) < 0.01);
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
      score: 0.01, matchedVariants: 300,
    });
    breakdown.total = 300;
    breakdown.weightSumSquared = 0.001;
    const np = { norm_mean: 1.0, norm_sd: 0.5, variants_number: 10000 };

    normalizePGS(details, breakdown, np);

    assert.equal(details.normMean, 0);
  });

  it('detects incompatible empirical stats', () => {
    const { details, breakdown } = makePGS({
      score: 0.79, matchedVariants: 790000, genotypedVariants: 790000,
    });
    breakdown.total = 790000;
    breakdown.weightSumSquared = 0.001;
    breakdown.genotypedVariants = 790000;
    const np = { norm_mean: 193.5, norm_sd: 0.08, variants_number: 6900000 };

    normalizePGS(details, breakdown, np);

    assert.equal(details.normMean, 0);
    assert.ok(Math.abs(details.zScore) < 50);
  });

  it('computes quantitative trait value', () => {
    const { details, breakdown } = makePGS({
      score: 1.0, matchedVariants: 500, genotypedVariants: 500,
    });
    breakdown.total = 500;
    breakdown.weightSumSquared = 1;
    const np = { norm_mean: 0, norm_sd: 1, variants_number: 500 };

    normalizePGS(details, breakdown, np, 'quantitative', 25.0, 4.0,
      { r2: 0.25 });

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

  it('selects highest quality even with extreme z-scores (clamped at normalization)', () => {
    const map = new Map([
      ['A', { qualityScore: 90, zScore: 4, insufficientData: false }],
      ['B', { qualityScore: 30, zScore: 1, insufficientData: false }],
    ]);
    assert.equal(selectBestPGS(map), 'A');
  });

  it('falls back to extreme z when all are insufficient', () => {
    const map = new Map([
      ['A', { qualityScore: 50, zScore: 10, insufficientData: true }],
    ]);
    assert.equal(selectBestPGS(map), 'A');
  });
});

describe('imputation shrinkage', () => {
  it('scales empirical mean by shrinkage, SD by shrinkage²', () => {
    // avgShrinkage=0.95 (typical for R²≈0.9)
    const { details, breakdown } = makePGS({
      score: 0.4, matchedVariants: 100, genotypedVariants: 0,
      imputedVariants: 100, avgShrinkage: 0.95,
    });
    breakdown.total = 100;
    const np = { norm_mean: 0.5, norm_sd: 0.2, variants_number: 100 };
    normalizePGS(details, breakdown, np);
    // 100% coverage → no coverage scaling. Mean × shrinkage, SD × shrinkage².
    assert.ok(Math.abs(details.normMean - 0.5 * 0.95) < 1e-6);
    assert.ok(Math.abs(details.normSd - 0.2 * 0.95 * 0.95) < 1e-6);
    const expectedZ = (0.4 - 0.5 * 0.95) / (0.2 * 0.95 * 0.95);
    assert.ok(Math.abs(details.zScore - expectedZ) < 0.01);
  });

  it('no shrinkage for genotyped-only data (shrinkage=1.0)', () => {
    const { details, breakdown } = makePGS({
      score: 1.0, matchedVariants: 100, genotypedVariants: 100,
      avgShrinkage: 1.0,
    });
    breakdown.total = 100;
    const np = { norm_mean: 0.5, norm_sd: 0.8, variants_number: 100 };
    normalizePGS(details, breakdown, np);
    assert.equal(details.normMean, 0.5);
    assert.equal(details.normSd, 0.8);
  });

  it('shrinkage + coverage scaling compound correctly', () => {
    // 50% coverage + 0.95 shrinkage
    const { details, breakdown } = makePGS({
      score: 0.2, matchedVariants: 50, genotypedVariants: 0,
      imputedVariants: 50, avgShrinkage: 0.95,
    });
    breakdown.total = 50;
    const np = { norm_mean: 0.5, norm_sd: 0.2, variants_number: 100 };
    normalizePGS(details, breakdown, np);
    // Coverage: mean*0.5, sd*√0.5. Then shrinkage: mean*0.95, sd*0.95²
    const sMean = 0.5 * 0.5 * 0.95;
    const sSd = 0.2 * Math.sqrt(0.5) * 0.95 * 0.95;
    assert.ok(Math.abs(details.normMean - sMean) < 1e-6);
    assert.ok(Math.abs(details.normSd - sSd) < 1e-6);
  });

  it('missing avgShrinkage defaults to 1.0 (no effect)', () => {
    const { details, breakdown } = makePGS({
      score: 1.0, matchedVariants: 100, genotypedVariants: 100,
    });
    breakdown.total = 100;
    const np = { norm_mean: 0.5, norm_sd: 0.8, variants_number: 100 };
    normalizePGS(details, breakdown, np);
    // No avgShrinkage property → defaults to 1.0
    assert.equal(details.normMean, 0.5);
    assert.equal(details.normSd, 0.8);
  });
});
