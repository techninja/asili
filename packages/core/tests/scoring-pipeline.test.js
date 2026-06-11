/**
 * End-to-end scoring pipeline tests — buildScoredMaps → finalize → percentile.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildScoredMaps } from '../src/duckdb/scored-maps.js';
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

  it('stores chromosome contribution and imputed counts', () => {
    const agg = [{
      pgs_id: 'PGS001', raw_score: 1.5, matched_variants: 3,
      imputed_variants: 1, genotyped_variants: 2,
      positive_count: 2, positive_sum: 1.8,
      negative_count: 1, negative_sum: -0.3, weight_sum_squared: 0.98,
    }];
    const cov = [
      { pgs_id: 'PGS001', chr: '1', cnt: 2, chr_contribution: 1.2, chr_imputed: 0 },
      { pgs_id: 'PGS001', chr: '2', cnt: 1, chr_contribution: 0.3, chr_imputed: 1 },
    ];
    const tot = [
      { pgs_id: 'PGS001', chr: '1', cnt: 5 },
      { pgs_id: 'PGS001', chr: '2', cnt: 3 },
    ];
    const result = buildScoredMaps(agg, cov, tot);
    const b = result.pgsBreakdown.get('PGS001');
    assert.equal(b.chromosomeContribution['1'], 1.2);
    assert.equal(b.chromosomeContribution['2'], 0.3);
    assert.equal(b.chromosomeImputed['1'], 0);
    assert.equal(b.chromosomeImputed['2'], 1);
    assert.equal(b.chromosomeTotals['1'], 5);
    assert.equal(b.chromosomeTotals['2'], 3);
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
    // wsq=0.98, varianceIncluded=true, sd=sqrt(0.98), z=1.5/sqrt(0.98)≈1.5153
    const scored = buildScoredMaps([{
      pgs_id: 'P', raw_score: 1.5, matched_variants: 3,
      imputed_variants: 0, genotyped_variants: 3,
      positive_count: 2, positive_sum: 1.8,
      negative_count: 1, negative_sum: -0.3, weight_sum_squared: 0.98,
    }], []);
    const result = finalize(scored,
      { P: { norm_mean: 0.5, norm_sd: 0.8, variants_number: 100 } });
    const expectedZ = 1.5 / Math.sqrt(0.98);
    assert.equal(r(result.zScore, 4), r(expectedZ, 4));
  });

  it('moderate coverage → scaled empirical normalization', () => {
    // 50/100=50% → uses empirical, scaled by coverage
    // scaled_mean = 0.5 * 0.5 = 0.25, scaled_sd = 0.8 * sqrt(0.5) ≈ 0.5657
    const scored = buildScoredMaps([{
      pgs_id: 'M50', raw_score: 0.8, matched_variants: 50,
      imputed_variants: 40, genotyped_variants: 10,
      positive_count: 30, positive_sum: 1.0,
      negative_count: 20, negative_sum: -0.2, weight_sum_squared: 0.5,
    }], []);
    const result = finalize(scored,
      { M50: { norm_mean: 0.5, norm_sd: 0.8, variants_number: 100 } });
    const sMean = 0.5 * 0.5;
    const sSd = 0.8 * Math.sqrt(0.5);
    assert.equal(r(result.zScore, 3), r((0.8 - sMean) / sSd, 3));
  });

  it('high coverage → scaled empirical normalization', () => {
    // 80/100=80% → uses empirical, scaled by coverage
    // scaled_mean = 0.5 * 0.8 = 0.4, scaled_sd = 0.8 * sqrt(0.8) ≈ 0.7155
    // z = (1.5 - 0.4) / 0.7155 ≈ 1.5366
    const scored = buildScoredMaps([{
      pgs_id: 'E', raw_score: 1.5, matched_variants: 80,
      imputed_variants: 60, genotyped_variants: 20,
      positive_count: 50, positive_sum: 2.0,
      negative_count: 30, negative_sum: -0.5, weight_sum_squared: 0.98,
    }], []);
    const result = finalize(scored,
      { E: { norm_mean: 0.5, norm_sd: 0.8, variants_number: 100 } });
    const sMean = 0.5 * 0.8;
    const sSd = 0.8 * Math.sqrt(0.8);
    assert.equal(r(result.zScore, 3), r((1.5 - sMean) / sSd, 3));
  });

  it('full coverage → unscaled empirical normalization', () => {
    // 100/100=100% → empirical, no scaling (coverage=1.0 skips scaling)
    // z = (1.5 - 0.5) / 0.8 = 1.25
    const scored = buildScoredMaps([{
      pgs_id: 'F', raw_score: 1.5, matched_variants: 100,
      imputed_variants: 80, genotyped_variants: 20,
      positive_count: 60, positive_sum: 2.0,
      negative_count: 40, negative_sum: -0.5, weight_sum_squared: 0.98,
    }], []);
    const result = finalize(scored,
      { F: { norm_mean: 0.5, norm_sd: 0.8, variants_number: 100 } });
    assert.equal(r(result.zScore, 4), 1.25);
  });

  it('quantitative trait → phenotype value', () => {
    // 100% coverage → no scaling. z=2.0, value = 170 + 2.0 * sqrt(0.25) * 10 = 180
    const scored = buildScoredMaps([{
      pgs_id: 'H', raw_score: 2.0, matched_variants: 100,
      imputed_variants: 80, genotyped_variants: 20,
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
    // wsq=0.98, varianceIncluded=true, sd=sqrt(0.98), z=1.5/sqrt(0.98)
    const scored = buildScoredMaps([{
      pgs_id: 'P', raw_score: 1.5, matched_variants: 20,
      imputed_variants: 0, genotyped_variants: 20,
      positive_count: 15, positive_sum: 2.0,
      negative_count: 5, negative_sum: -0.5, weight_sum_squared: 0.98,
    }], []);
    const result = finalize(scored, {});
    assert.equal(r(result.zScore, 4), r(1.5 / Math.sqrt(0.98), 4));
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
        imputed_variants: 40, genotyped_variants: 10,
        positive_count: 30, positive_sum: 0.8,
        negative_count: 20, negative_sum: -0.3, weight_sum_squared: 0.5 },
      { pgs_id: 'B', raw_score: 0.3, matched_variants: 800,
        imputed_variants: 60, genotyped_variants: 200,
        positive_count: 500, positive_sum: 0.5,
        negative_count: 300, negative_sum: -0.2, weight_sum_squared: 0.3 },
    ], []);
    // B: 800/1000=80% coverage vs A: 50/100=50% → B wins on coverage + sample
    const result = finalize(scored, {
      A: { norm_mean: 0, norm_sd: 1, variants_number: 100 },
      B: { norm_mean: 0, norm_sd: 1, variants_number: 1000 },
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

