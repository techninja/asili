// Unified PGS filtering logic for Asili
// Used during trait management to validate PGS scores before adding to catalog

const INTEGRATIVE_METHOD_KEYWORDS = [
  'integrative', 'meta-analysis', 'meta analysis', 'component', 'composite',
  'combined', 'ensemble', 'multi-trait', 'multitrait', 'cross-trait', 'crosstrait',
  'linear weight combination', 'weighted combination'
];

const WEIGHT_THRESHOLDS = {
  max_absolute: 100,
  min_variance: 0.001,
  extreme_mean: 100,
  mean_sd_ratio: 8
};

const PERFORMANCE_MIN_WEIGHT = 0.3;

async function validateWeights(pgsId, pgsApiClient) {
  try {
    const fileContent = await pgsApiClient.getPGSFile(pgsId);
    
    // Find header and weight column
    let weightColIdx = -1;
    let pos = 0;
    
    while (pos < fileContent.length) {
      const nextNewline = fileContent.indexOf('\n', pos);
      if (nextNewline === -1) break;
      
      const line = fileContent.slice(pos, nextNewline);
      pos = nextNewline + 1;
      
      if (line.startsWith('#')) continue;
      
      const cols = line.split('\t');
      weightColIdx = cols.findIndex(c => c === 'effect_weight' || c === 'weight');
      if (weightColIdx === -1) return { valid: true };
      break;
    }
    
    // Sample up to 1000 weights
    const weights = [];
    let count = 0;
    
    while (pos < fileContent.length && weights.length < 1000) {
      const nextNewline = fileContent.indexOf('\n', pos);
      if (nextNewline === -1) break;
      
      const line = fileContent.slice(pos, nextNewline);
      pos = nextNewline + 1;
      
      if (!line) continue;
      
      const weight = parseFloat(line.split('\t')[weightColIdx]);
      if (!isNaN(weight)) {
        weights.push(weight);
      }
    }
    
    if (weights.length === 0) return { valid: true };
    
    const min = Math.min(...weights);
    const max = Math.max(...weights);
    const mean = weights.reduce((a,b) => a+b, 0) / weights.length;
    const variance = weights.reduce((a,b) => a + (b-mean)**2, 0) / weights.length;
    
    // Check for extreme weights
    if (Math.abs(min) > WEIGHT_THRESHOLDS.max_absolute || Math.abs(max) > WEIGHT_THRESHOLDS.max_absolute) {
      return { valid: false, reason: `Extreme weight detected: ${Math.max(Math.abs(min), Math.abs(max)).toFixed(2)}` };
    }
    
    // Check for suspiciously uniform weights (all nearly identical)
    if (variance < WEIGHT_THRESHOLDS.min_variance) {
      return { valid: false, reason: `Zero variance weights (all identical): mean=${mean.toFixed(2)}` };
    }
    
    return { valid: true, stats: { mean, std: Math.sqrt(variance) } };
  } catch (error) {
    return { valid: true }; // Don't exclude if we can't validate
  }
}

// Performance metrics helpers
function shouldReplaceMetric(current, candidate) {
  const hierarchy = { 'C-index': 4, 'R²': 3, 'AUROC': 3, 'AUC': 3, 'OR': 1, 'HR': 1, 'β': 1 };
  const currentRank = hierarchy[current.type] || 0;
  const candidateRank = hierarchy[candidate.type] || 0;
  
  if (candidateRank > currentRank) return true;
  if (candidateRank === currentRank && candidate.value > current.value) return true;
  return false;
}

function calculatePerformanceWeight(metrics) {
  if (!metrics.has_validation || !metrics.best_metric) return 0.5;
  
  const { type, value } = metrics.best_metric;
  
  switch (type) {
    case 'C-index':
    case 'AUROC':
    case 'AUC':
      return Math.max(0, Math.min(1, (value - 0.5) * 2));
    case 'R²':
      return Math.min(1, value);
    case 'OR':
    case 'HR':
    case 'β':
      return Math.min(1, Math.abs(Math.log(value)) / 2);
    default:
      return 0.5;
  }
}

async function getPerformanceMetrics(pgsId, pgsApiClient) {
  try {
    const metrics = {
      pgs_id: pgsId,
      has_validation: false,
      best_metric: null,
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
      const perfMetrics = perf.performance_metrics;
      
      const extractMetrics = (metricsArray) => {
        if (!metricsArray) return;
        for (const m of metricsArray) {
          const metric = {
            type: m.name_short,
            value: m.estimate,
            ci_lower: m.ci_lower,
            ci_upper: m.ci_upper,
            sample_size: sampleN,
            ancestry
          };
          metrics.all_metrics.push(metric);
          if (!metrics.best_metric || shouldReplaceMetric(metrics.best_metric, metric)) {
            metrics.best_metric = metric;
          }
        }
      };
      
      extractMetrics(perfMetrics?.effect_sizes);
      extractMetrics(perfMetrics?.class_acc);
      extractMetrics(perfMetrics?.othermetrics);
    }
    
    return metrics;
  } catch (error) {
    return { pgs_id: pgsId, has_validation: false, error: error.message };
  }
}

async function shouldExcludePGS(pgsId, scoreData, pgsApiClient = null) {
  const methodName = (scoreData.method_name || '').toLowerCase();
  const methodParams = (scoreData.method_params || '').toLowerCase();
  const weightType = scoreData.weight_type || '';
  
  // Check for integrative methods
  for (const keyword of INTEGRATIVE_METHOD_KEYWORDS) {
    if (methodName.includes(keyword) || methodParams.includes(keyword)) {
      return { exclude: true, reason: `Integrative method: ${keyword}` };
    }
  }
  
  // Exclude NR (Not Reported) weight types - they use incompatible scales
  if (weightType === 'NR') {
    return { exclude: true, reason: 'Weight type not reported (NR) - incompatible scale' };
  }
  
  // Exclude Inverse-variance weighting - uses incompatible scale
  if (weightType === 'Inverse-variance weighting') {
    return { exclude: true, reason: 'Inverse-variance weighting - incompatible scale' };
  }
  
  // Check for inverse weighting in method description
  if (methodName.includes('inverse') || methodParams.includes('inverse') ||
      methodName.includes('variant weights') || methodParams.includes('variant weights')) {
    return { exclude: true, reason: 'Method uses inverse or variant weighting scheme' };
  }
  
  // Validate actual weights if API client provided
  if (pgsApiClient) {
    const weightCheck = await validateWeights(pgsId, pgsApiClient);
    if (!weightCheck.valid) {
      return { exclude: true, reason: weightCheck.reason };
    }
    
    // Check for incompatible scale (extreme mean/std ratio)
    if (weightCheck.stats) {
      const ratio = Math.abs(weightCheck.stats.mean / weightCheck.stats.std);
      if (ratio > WEIGHT_THRESHOLDS.mean_sd_ratio) {
        return { exclude: true, reason: `Incompatible scale: mean/std ratio = ${ratio.toFixed(1)}` };
      }
      
      // Check for extreme mean values
      if (Math.abs(weightCheck.stats.mean) > WEIGHT_THRESHOLDS.extreme_mean) {
        return { exclude: true, reason: `Extreme mean value: ${weightCheck.stats.mean.toFixed(2)}` };
      }
    }
  }
  
  // Get performance metrics if API client provided
  let performanceWeight = 0.5;
  let performanceMetrics = null;
  
  if (pgsApiClient) {
    performanceMetrics = await getPerformanceMetrics(pgsId, pgsApiClient);
    performanceWeight = calculatePerformanceWeight(performanceMetrics);
  }
  
  return { 
    exclude: false, 
    reason: 'Standard PGS score',
    performance_weight: performanceWeight,
    performance_metrics: performanceMetrics
  };
}

export { shouldExcludePGS, INTEGRATIVE_METHOD_KEYWORDS, WEIGHT_THRESHOLDS, getPerformanceMetrics, calculatePerformanceWeight };
