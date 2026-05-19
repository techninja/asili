import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateZScore, calculatePercentile, estimateTheoreticalSD,
  calculateConfidence, calculateQualityScore,
} from '../src/calculator.js';

describe('calculateZScore', () => {
  it('computes z from raw score and stats', () => {
    assert.equal(calculateZScore(1.5, { mean: 1.0, sd: 0.5 }), 1.0);
    assert.equal(calculateZScore(0, { mean: 0, sd: 1 }), 0);
  });

  it('returns null for missing stats', () => {
    assert.equal(calculateZScore(1.0, null), null);
    assert.equal(calculateZScore(1.0, { mean: 0, sd: 0 }), null);
  });
});

describe('calculatePercentile', () => {
  it('returns ~50 for z=0', () => {
    const p = calculatePercentile(0);
    assert.ok(Math.abs(p - 50) < 0.5);
  });

  it('returns ~84 for z=1', () => {
    const p = calculatePercentile(1);
    assert.ok(Math.abs(p - 84.1) < 1);
  });

  it('returns ~16 for z=-1', () => {
    const p = calculatePercentile(-1);
    assert.ok(Math.abs(p - 15.9) < 1);
  });

  it('returns null for null input', () => {
    assert.equal(calculatePercentile(null), null);
  });
});

describe('estimateTheoreticalSD', () => {
  it('computes sqrt(sumW2 * 0.5)', () => {
    const sd = estimateTheoreticalSD(4, 2);
    assert.ok(Math.abs(sd - Math.sqrt(2)) < 1e-5);
  });

  it('returns 1.0 for empty input', () => {
    assert.equal(estimateTheoreticalSD(0, 0), 1.0);
  });
});

describe('calculateConfidence', () => {
  it('maps variant counts to confidence levels', () => {
    assert.equal(calculateConfidence(0), 'none');
    assert.equal(calculateConfidence(5), 'insufficient');
    assert.equal(calculateConfidence(9), 'low');
    assert.equal(calculateConfidence(50), 'medium');
    assert.equal(calculateConfidence(200), 'high');
  });
});

describe('calculateQualityScore', () => {
  it('returns 0 for no matched variants', () => {
    assert.equal(calculateQualityScore(0, 100, 0.1), 0);
  });

  it('returns 0 for no total variants', () => {
    assert.equal(calculateQualityScore(50, 0, 0.1), 0);
  });

  it('higher R² produces higher score', () => {
    const low = calculateQualityScore(100, 100, 0.01, true, 1.0, 100);
    const high = calculateQualityScore(100, 100, 0.5, true, 1.0, 100);
    assert.ok(high > low);
  });

  it('higher genotyped ratio produces higher score', () => {
    const allImputed = calculateQualityScore(100, 100, 0.1, true, 1.0, 0);
    const allGenotyped = calculateQualityScore(100, 100, 0.1, true, 1.0, 100);
    assert.ok(allGenotyped > allImputed);
  });

  it('applies coverage penalty below 5%', () => {
    const low = calculateQualityScore(2, 100, 0.5, true, 1.0, 2);
    const high = calculateQualityScore(50, 100, 0.5, true, 1.0, 50);
    assert.ok(high > low);
  });

  it('zeroes signal for extreme z-scores (>5σ)', () => {
    const normal = calculateQualityScore(100, 100, 0.1, true, 2.0, 100);
    const extreme = calculateQualityScore(100, 100, 0.1, true, 21.0, 100);
    assert.ok(extreme < normal);
  });
});
