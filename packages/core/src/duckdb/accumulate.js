/**
 * PGS aggregate accumulator — merges per-chromosome results into per-PGS totals.
 * @module packages/core/src/duckdb/accumulate
 */

const n = (v) => Number(v);

/** @param {Map} map @param {object} r */
export function accumulate(map, r) {
  const pid = r.pgs_id, e = map.get(pid);
  if (e) {
    e.raw_score += n(r.raw_score); e.matched_variants += n(r.matched_variants);
    e.imputed_variants += n(r.imputed_variants); e.genotyped_variants += n(r.genotyped_variants);
    e.positive_count += n(r.pos_count); e.positive_sum += n(r.pos_sum);
    e.negative_count += n(r.neg_count); e.negative_sum += n(r.neg_sum);
    e.weight_sum_squared += n(r.wsq);
    e._shrinkageSum += n(r.avg_shrinkage) * n(r.matched_variants);
  } else {
    map.set(pid, {
      pgs_id: pid, raw_score: n(r.raw_score),
      matched_variants: n(r.matched_variants), imputed_variants: n(r.imputed_variants),
      genotyped_variants: n(r.genotyped_variants),
      positive_count: n(r.pos_count), positive_sum: n(r.pos_sum),
      negative_count: n(r.neg_count), negative_sum: n(r.neg_sum),
      weight_sum_squared: n(r.wsq),
      _shrinkageSum: n(r.avg_shrinkage) * n(r.matched_variants),
    });
  }
}
