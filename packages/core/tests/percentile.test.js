/**
 * Z-score → percentile verification against known statistical values.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { calculateZScore, calculatePercentile } from '../src/calculator.js';

describe('z-score → percentile known values', () => {
  const cases = [
    [0, 50], [-1, 15.87], [1, 84.13], [-2, 2.28],
    [2, 97.72], [-3, 0.13], [3, 99.87],
  ];
  for (const [z, expected] of cases) {
    it(`z=${z} → ~${expected}%`, () => {
      assert.ok(Math.abs(calculatePercentile(z) - expected) < 0.5);
    });
  }
});

describe('z-score calculation', () => {
  it('(1.5-0.5)/0.8 = 1.25', () => {
    assert.equal(calculateZScore(1.5, { mean: 0.5, sd: 0.8 }), 1.25);
  });
  it('(-0.5-0.5)/0.8 = -1.25', () => {
    assert.equal(calculateZScore(-0.5, { mean: 0.5, sd: 0.8 }), -1.25);
  });
  it('symmetric: z=1 and z=-1 sum to 100%', () => {
    const p1 = calculatePercentile(1);
    const p2 = calculatePercentile(-1);
    assert.ok(Math.abs(p1 + p2 - 100) < 0.5);
  });
  it('extreme z=4 → >99.99%', () => {
    assert.ok(calculatePercentile(4) > 99.99);
  });
  it('extreme z=-4 → <0.01%', () => {
    assert.ok(calculatePercentile(-4) < 0.01);
  });
});
