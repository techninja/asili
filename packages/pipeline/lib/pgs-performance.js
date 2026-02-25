// PGS Performance Metrics - Use validation data to interpret and weight scores

export async function getPerformanceMetrics(pgsId, pgsApiClient) {
  try {
    const metrics = {
      pgs_id: pgsId,
      has_validation: false,
      best_metric: null,
      sample_sizes: [],
      ancestries: [],
      all_metrics: []
    };
    
    const perfData = await pgsApiClient.searchPerformanceMetrics(pgsId);
    
    if (!perfData.results || perfData.results.length === 0) {
      return metrics;
    }
    
    metrics.has_validation = true;
    
    for (const perf of perfData.results) {
      const sampleN = perf.sampleset?.samples?.[0]?.sample_number || 0;
      const ancestry = perf.sampleset?.samples?.[0]?.ancestry_broad;
      
      if (sampleN) metrics.sample_sizes.push(sampleN);
      if (ancestry) metrics.ancestries.push(ancestry);
      
      // Extract metrics from performance_metrics object
      const perfMetrics = perf.performance_metrics;
      
      // Check effect_sizes (OR, HR, Beta)
      if (perfMetrics?.effect_sizes) {
        for (const effect of perfMetrics.effect_sizes) {
          const metric = {
            type: effect.name_short,
            value: effect.estimate,
            ci_lower: effect.ci_lower,
            ci_upper: effect.ci_upper,
            sample_size: sampleN,
            ancestry
          };
          metrics.all_metrics.push(metric);
          
          if (!metrics.best_metric || shouldReplaceMetric(metrics.best_metric, metric)) {
            metrics.best_metric = metric;
          }
        }
      }
      
      // Check class_acc (AUC, C-index)
      if (perfMetrics?.class_acc) {
        for (const acc of perfMetrics.class_acc) {
          const metric = {
            type: acc.name_short,
            value: acc.estimate,
            ci_lower: acc.ci_lower,
            ci_upper: acc.ci_upper,
            sample_size: sampleN,
            ancestry
          };
          metrics.all_metrics.push(metric);
          
          if (!metrics.best_metric || shouldReplaceMetric(metrics.best_metric, metric)) {
            metrics.best_metric = metric;
          }
        }
      }
      
      // Check othermetrics (R², etc)
      if (perfMetrics?.othermetrics) {
        for (const other of perfMetrics.othermetrics) {
          const metric = {
            type: other.name_short,
            value: other.estimate,
            ci_lower: other.ci_lower,
            ci_upper: other.ci_upper,
            sample_size: sampleN,
            ancestry
          };
          metrics.all_metrics.push(metric);
          
          if (!metrics.best_metric || shouldReplaceMetric(metrics.best_metric, metric)) {
            metrics.best_metric = metric;
          }
        }
      }
    }
    
    return metrics;
  } catch (error) {
    return { pgs_id: pgsId, has_validation: false, error: error.message };
  }
}

function shouldReplaceMetric(current, candidate) {
  const hierarchy = { 'C-index': 4, 'R²': 3, 'AUC': 2, 'OR': 1, 'HR': 1 };
  const currentRank = hierarchy[current.type] || 0;
  const candidateRank = hierarchy[candidate.type] || 0;
  
  if (candidateRank > currentRank) return true;
  if (candidateRank === currentRank && candidate.value > current.value) return true;
  return false;
}

export function calculatePerformanceWeight(metrics) {
  if (!metrics.has_validation || !metrics.best_metric) {
    return 0.5; // Default weight for unvalidated scores
  }
  
  const { type, value } = metrics.best_metric;
  
  // Convert different metrics to 0-1 scale
  switch (type) {
    case 'C-index':
    case 'AUC':
      // Already 0-1, center around 0.5
      return Math.max(0, (value - 0.5) * 2);
    
    case 'R²':
      // R² is 0-1, use directly
      return Math.min(1, value);
    
    case 'OR':
    case 'HR':
      // Odds/Hazard ratios: 1 = no effect, >1 = risk
      // Convert to 0-1 scale: log scale centered at 1
      return Math.min(1, Math.abs(Math.log(value)) / 2);
    
    default:
      return 0.5;
  }
}

export async function shouldIncludeByPerformance(pgsId, pgsApiClient, minWeight = 0.3) {
  const metrics = await getPerformanceMetrics(pgsId, pgsApiClient);
  const weight = calculatePerformanceWeight(metrics);
  
  return {
    include: weight >= minWeight,
    weight,
    metrics,
    reason: weight < minWeight ? `Low performance: ${weight.toFixed(2)}` : 'Validated'
  };
}
