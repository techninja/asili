import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

/**
 * Inline the bin reconstruction logic from pgs-distribution.js
 * since the module depends on fetch (browser-only).
 */
function reconstructBins(m, s, d) {
  const lo = m - 4 * s,
    step = (8 * s) / d.length;
  return d.map((density, i) => ({
    min: lo + i * step,
    max: lo + (i + 1) * step,
    density,
  }));
}

describe('PGS distribution bin reconstruction', () => {
  it('creates correct number of bins', () => {
    const d = new Array(25).fill(0.04);
    const bins = reconstructBins(0, 1, d);
    assert.equal(bins.length, 25);
  });

  it('bins span ±4σ around mean', () => {
    const d = new Array(25).fill(0.04);
    const bins = reconstructBins(5, 2, d);
    assert.ok(Math.abs(bins[0].min - (5 - 8)) < 1e-6);
    assert.ok(Math.abs(bins[24].max - (5 + 8)) < 1e-6);
  });

  it('bins are contiguous', () => {
    const d = [0.01, 0.05, 0.1, 0.2, 0.3];
    const bins = reconstructBins(0, 1, d);
    for (let i = 1; i < bins.length; i++) {
      assert.ok(Math.abs(bins[i].min - bins[i - 1].max) < 1e-10);
    }
  });

  it('preserves density values', () => {
    const d = [0.01, 0.05, 0.15, 0.3, 0.15, 0.05, 0.01];
    const bins = reconstructBins(0, 1, d);
    assert.equal(bins[3].density, 0.3);
    assert.equal(bins[0].density, 0.01);
  });

  it('uniform bin width', () => {
    const d = new Array(25).fill(0.04);
    const bins = reconstructBins(0, 1, d);
    const w = bins[0].max - bins[0].min;
    for (const b of bins) {
      assert.ok(Math.abs(b.max - b.min - w) < 1e-10);
    }
  });

  it('handles different mean/sd', () => {
    const d = [0.1, 0.2, 0.1];
    const bins = reconstructBins(100, 10, d);
    assert.ok(Math.abs(bins[0].min - 60) < 1e-6);
    assert.ok(Math.abs(bins[2].max - 140) < 1e-6);
  });
});
