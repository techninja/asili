import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { scoreFromMatches, finalize } from '../src/scorer.js';

async function* mockMatches(rows) {
  if (rows.length) yield rows.map(m => ({
    pgs_id: m.pgsId, variant_id: m.variantId, effect_allele: m.effectAllele,
    effect_weight: m.effectWeight, dosage: m.dosage, imputed: m.imputed,
  }));
}

describe('scoreFromMatches', () => {
  it('accumulates scores from matched variants', async () => {
    const matches = [
      { pgsId: 'PGS001', variantId: '1:100:A:G', effectAllele: 'A', effectWeight: 0.5, dosage: 2, imputed: false },
      { pgsId: 'PGS001', variantId: '1:200:T:C', effectAllele: 'T', effectWeight: -0.3, dosage: 1, imputed: false },
      { pgsId: 'PGS001', variantId: '2:300:G:A', effectAllele: 'G', effectWeight: 0.8, dosage: 1, imputed: true },
    ];

    const result = await scoreFromMatches(mockMatches(matches), new Map([['PGS001', 100]]));

    assert.equal(result.totalMatches, 3);
    const d = result.pgsDetails.get('PGS001');
    assert.ok(Math.abs(d.score - 1.5) < 1e-5);
    assert.equal(d.matchedVariants, 3);
    assert.equal(d.genotypedVariants, 2);
    assert.equal(d.imputedVariants, 1);

    const b = result.pgsBreakdown.get('PGS001');
    assert.equal(b.positive, 2);
    assert.equal(b.negative, 1);
    assert.equal(b.chromosomeCoverage['1'], 2);
    assert.equal(b.chromosomeCoverage['2'], 1);
  });

  it('handles multiple PGS in same trait', async () => {
    const matches = [
      { pgsId: 'A', variantId: '1:100:A:G', effectAllele: 'A', effectWeight: 0.5, dosage: 1, imputed: false },
      { pgsId: 'B', variantId: '1:100:A:G', effectAllele: 'A', effectWeight: 0.3, dosage: 1, imputed: false },
      { pgsId: 'A', variantId: '2:200:T:C', effectAllele: 'T', effectWeight: 0.2, dosage: 2, imputed: true },
    ];

    const result = await scoreFromMatches(mockMatches(matches), new Map([['A', 50], ['B', 30]]));

    assert.equal(result.totalMatches, 3);
    assert.ok(Math.abs(result.pgsDetails.get('A').score - 0.9) < 1e-5);
    assert.ok(Math.abs(result.pgsDetails.get('B').score - 0.3) < 1e-5);
  });

  it('handles empty match set', async () => {
    const result = await scoreFromMatches(mockMatches([]), new Map());
    assert.equal(result.totalMatches, 0);
    assert.equal(result.pgsDetails.size, 0);
  });
});

describe('finalize', () => {
  it('selects best PGS and produces trait result', async () => {
    const matches = [];
    for (let i = 0; i < 10; i++) {
      matches.push({
        pgsId: 'PGS001', variantId: `1:${100 + i}:A:G`,
        effectAllele: 'A', effectWeight: 0.1, dosage: 1, imputed: false,
      });
    }

    const scored = await scoreFromMatches(mockMatches(matches), new Map([['PGS001', 100]]));
    const result = finalize(scored, {
      PGS001: { norm_mean: 0, norm_sd: 1, variants_number: 100 },
    });

    assert.equal(result.bestPGS, 'PGS001');
    assert.ok(result.zScore !== null);
    assert.ok(result.percentile !== null);
  });

  it('computes quantitative value', async () => {
    const matches = [];
    for (let i = 0; i < 500; i++) {
      matches.push({
        pgsId: 'Q', variantId: `1:${i}:A:G`,
        effectAllele: 'A', effectWeight: 0.002, dosage: 1, imputed: false,
      });
    }

    const scored = await scoreFromMatches(mockMatches(matches), new Map([['Q', 500]]));
    const result = finalize(scored,
      { Q: { norm_mean: 0, norm_sd: 1, variants_number: 500 } },
      { traitType: 'quantitative', phenotypeMean: 25.0, phenotypeSd: 4.0,
        pgsPerformance: { Q: { r2: 0.25 } } },
    );

    assert.ok(result.value !== undefined);
  });
});
