/**
 * PGS quality filtering.
 * Determines whether a PGS score should be included in the catalog.
 */
import pgsApi from './pgs-api-client.js';

const INTEGRATIVE_KEYWORDS = [
  'integrative', 'meta-analysis', 'meta analysis', 'composite',
  'combined', 'ensemble', 'multi-trait', 'multitrait',
  'cross-trait', 'crosstrait', 'linear weight combination',
];

const METRIC_RANK = { 'C-index': 4, 'R²': 3, AUROC: 3, AUC: 3, OR: 1, HR: 1, 'β': 1 };

/**
 *
 */
function calcPerformanceWeight(metrics) {
  if (!metrics?.best_metric) return 0.5;
  const { type, value } = metrics.best_metric;
  if (type === 'R²') return Math.min(1, value);
  if (['C-index', 'AUROC', 'AUC'].includes(type)) return Math.max(0, Math.min(1, (value - 0.5) * 2));
  if (['OR', 'HR', 'β'].includes(type)) return Math.min(1, Math.abs(Math.log(value)) / 2);
  return 0.5;
}

/**
 *
 */
async function getPerformanceMetrics(pgsId) {
  try {
    const data = await pgsApi.searchPerformance(pgsId);
    const metrics = { pgs_id: pgsId, has_validation: false, best_metric: null, all_metrics: [] };
    if (!data.results?.length) return metrics;
    metrics.has_validation = true;

    for (const perf of data.results) {
      const sampleN = perf.sampleset?.samples?.[0]?.sample_number || 0;
      const ancestry = perf.sampleset?.samples?.[0]?.ancestry_broad;
      const extract = arr => {
        if (!arr) return;
        for (const m of arr) {
          const entry = {
            type: m.name_short, value: m.estimate,
            ci_lower: m.ci_lower, ci_upper: m.ci_upper,
            sample_size: sampleN, ancestry,
          };
          metrics.all_metrics.push(entry);
          if (!metrics.best_metric ||
            (METRIC_RANK[entry.type] || 0) > (METRIC_RANK[metrics.best_metric.type] || 0) ||
            ((METRIC_RANK[entry.type] || 0) === (METRIC_RANK[metrics.best_metric.type] || 0) &&
              entry.value > metrics.best_metric.value)) {
            metrics.best_metric = entry;
          }
        }
      };
      extract(perf.performance_metrics?.effect_sizes);
      extract(perf.performance_metrics?.class_acc);
      extract(perf.performance_metrics?.othermetrics);
    }
    return metrics;
  } catch {
    return { pgs_id: pgsId, has_validation: false, best_metric: null, all_metrics: [] };
  }
}

/**
 * Evaluate whether a PGS score should be excluded from the catalog.
 * @param {string} pgsId
 * @param {object} scoreData - PGS Catalog score metadata
 * @returns {Promise<{exclude: boolean, reason: string, performance_weight: number, performance_metrics: object}>}
 */
export async function shouldExcludePGS(pgsId, scoreData) {
  if (scoreData.variants_number && scoreData.variants_number < 8) {
    return {
      exclude: true, reason: `Too few variants: ${scoreData.variants_number}`,
      performance_weight: 0, performance_metrics: null,
    };
  }

  const method = (scoreData.method_name || '').toLowerCase();
  const params = (scoreData.method_params || '').toLowerCase();
  const integrative = INTEGRATIVE_KEYWORDS.some(k => method.includes(k) || params.includes(k));

  const perfMetrics = await getPerformanceMetrics(pgsId);
  const perfWeight = calcPerformanceWeight(perfMetrics);

  return {
    exclude: false,
    reason: integrative ? 'Integrative PGS (flagged)' : 'Standard PGS score',
    performance_weight: perfWeight,
    performance_metrics: perfMetrics,
  };
}
