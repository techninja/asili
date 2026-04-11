/**
 * End-to-end scoring pipeline tests — buildScoredMaps → finalize → percentile.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildScoredMaps } from '../src/duckdb/unified-source.js';
import { finalize } from '../src/scorer.js';

const r = (v, d = 6) => Math.round(v * 10 ** d) / 10 ** d;

describe('buildScoredMaps', () => {
  it('converts SQL aggregates to finalize format', () => {
    const agg = [{
      pgs_id: 'PGS001', raw_score: 1.5, matched_variants: 3,
      imputed_variants: 1, genotyped_variants: 2,
      positive_count: 2, positive_sum: 1.8,
      negative_count: 1, negative_sum: -0.3, weight_sum_squared: 0.98,
    }];
    const cov = [
      { pgs_id: 'PGS001', chr: '1', cnt: 2 },
      { pgs_id: 'PGS001', chr: '2', cnt: 1 },
    ];
    const result = buildScoredMaps(agg, cov);
    assert.equal(result.totalMatches, 3);
    const d = result.pgsDetails.get('PGS001');
    assert.equal(d.score, 1.5);
    assert.equal(d.matchedVariants, 3);
    assert.equal(d.genotypedVariants, 2);
    assert.equal(d.imputedVariants, 1);
    const b = result.pgsBreakdown.get('PGS001');
    assert.equal(b.positive, 2);
    assert.equal(b.negative, 1);
    assert.equal(r(b.positiveSum), 1.8);
    assert.equal(r(b.negativeSum), -0.3);
    assert.equal(b.chromosomeCoverage['1'], 2);
    assert.equal(b.chromosomeCoverage['2'], 1);
  });

  it('accumulates across chromosomes', () => {
    const agg = [
      { pgs_id: 'P', raw_score: 0.5, matched_variants: 2,
        imputed_variants: 0, genotyped_variants: 2,
        positive_count: 1, positive_sum: 0.8,
        negative_count: 1, negative_sum: -0.3, weight_sum_squared: 0.73 },
      { pgs_id: 'P', raw_score: 0.3, matched_variants: 1,
        imputed_variants: 0, genotyped_variants: 1,
        positive_count: 1, positive_sum: 0.3,
        negative_count: 0, negative_sum: 0, weight_sum_squared: 0.09 },
    ];
    const map = new Map();
    for (const row of agg) {
      const e = map.get(row.pgs_id);
      if (e) {
        e.raw_score += row.raw_score;
        e.matched_variants += row.matched_variants;
        e.positive_count += row.positive_count;
        e.weight_sum_squared += row.weight_sum_squared;
      } else { map.set(row.pgs_id, { ...row }); }
    }
    const result = buildScoredMaps([...map.values()], []);
    assert.equal(r(result.pgsDetails.get('P').score), 0.8);
    assert.equal(result.pgsDetails.get('P').matchedVariants, 3);
  });
});

describe('end-to-end scoring pipeline', () => {
  it('low coverage → theoretical SD fallback', () => {
    // 3/100 = 3% < MIN_COVERAGE(5%) → theoretical SD
    // wsq=0.98, sd=sqrt(0.98*0.5)=0.7, z=1.5/0.7≈2.1429
    const scored = buildScoredMaps([{
      pgs_id: 'P', raw_score: 1.5, matched_variants: 3,
      imputed_variants: 0, genotyped_variants: 3,
      positive_count: 2, positive_sum: 1.8,
      negative_count: 1, negative_sum: -0.3, weight_sum_squared: 0.98,
    }], []);
    const result = finalize(scored,
      { P: { norm_mean: 0.5, norm_sd: 0.8, variants_number: 100 } });
    const expectedZ = 1.5 / Math.sqrt(0.98 * 0.5);
    assert.equal(r(result.zScore, 4), r(expectedZ, 4));
  });

  it('high coverage → empirical normalization', () => {
    // 80/100=80% → uses empirical norm_mean=0.5, norm_sd=0.8
    // z = (1.5-0.5)/0.8 = 1.25 → ~89.44%
    const scored = buildScoredMaps([{
      pgs_id: 'E', raw_score: 1.5, matched_variants: 80,
      imputed_variants: 0, genotyped_variants: 80,
      positive_count: 50, positive_sum: 2.0,
      negative_count: 30, negative_sum: -0.5, weight_sum_squared: 0.98,
    }], []);
    const result = finalize(scored,
      { E: { norm_mean: 0.5, norm_sd: 0.8, variants_number: 100 } });
    assert.equal(r(result.zScore, 4), 1.25);
    assert.ok(Math.abs(result.percentile - 89.44) < 1);
  });

  it('quantitative trait → phenotype value', () => {
    // z=2.0, phenotypeMean=170, phenotypeSd=10, r2=0.25
    // value = 170 + 2.0 * sqrt(0.25) * 10 = 180
    const scored = buildScoredMaps([{
      pgs_id: 'H', raw_score: 2.0, matched_variants: 50,
      imputed_variants: 0, genotyped_variants: 50,
      positive_count: 40, positive_sum: 2.5,
      negative_count: 10, negative_sum: -0.5, weight_sum_squared: 0.5,
    }], []);
    const result = finalize(scored,
      { H: { norm_mean: 1.0, norm_sd: 0.5, variants_number: 100 } },
      { traitType: 'quantitative', phenotypeMean: 170, phenotypeSd: 10,
        pgsPerformance: { H: { r2: 0.25 } } });
    assert.equal(r(result.zScore, 4), 2.0);
    assert.equal(r(result.value, 4), 180);
  });

  it('no norm params → theoretical SD', () => {
    // wsq=0.98, sd=sqrt(0.49)=0.7, z=1.5/0.7
    const scored = buildScoredMaps([{
      pgs_id: 'P', raw_score: 1.5, matched_variants: 20,
      imputed_variants: 0, genotyped_variants: 20,
      positive_count: 15, positive_sum: 2.0,
      negative_count: 5, negative_sum: -0.5, weight_sum_squared: 0.98,
    }], []);
    const result = finalize(scored, {});
    assert.equal(r(result.zScore, 4), r(1.5 / Math.sqrt(0.49), 4));
  });

  it('mixed imputed + genotyped', () => {
    const scored = buildScoredMaps([{
      pgs_id: 'M', raw_score: 1.28, matched_variants: 2,
      imputed_variants: 1, genotyped_variants: 1,
      positive_count: 2, positive_sum: 1.28,
      negative_count: 0, negative_sum: 0, weight_sum_squared: 0.52,
    }], []);
    const d = scored.pgsDetails.get('M');
    assert.equal(r(d.score), 1.28);
    assert.equal(d.imputedVariants, 1);
    assert.equal(d.genotypedVariants, 1);
  });

  it('selects best PGS from multiple', () => {
    const scored = buildScoredMaps([
      { pgs_id: 'A', raw_score: 0.5, matched_variants: 50,
        imputed_variants: 0, genotyped_variants: 50,
        positive_count: 30, positive_sum: 0.8,
        negative_count: 20, negative_sum: -0.3, weight_sum_squared: 0.5 },
      { pgs_id: 'B', raw_score: 0.3, matched_variants: 200,
        imputed_variants: 0, genotyped_variants: 200,
        positive_count: 120, positive_sum: 0.5,
        negative_count: 80, negative_sum: -0.2, weight_sum_squared: 0.3 },
    ], []);
    const result = finalize(scored, {
      A: { norm_mean: 0, norm_sd: 1, variants_number: 100 },
      B: { norm_mean: 0, norm_sd: 1, variants_number: 500 },
    });
    assert.equal(result.bestPGS, 'B');
  });

  it('zero-contribution variants count as matched', () => {
    const scored = buildScoredMaps([{
      pgs_id: 'Z', raw_score: 0, matched_variants: 10,
      imputed_variants: 0, genotyped_variants: 10,
      positive_count: 0, positive_sum: 0,
      negative_count: 0, negative_sum: 0, weight_sum_squared: 2.5,
    }], []);
    assert.equal(scored.totalMatches, 10);
  });
});

