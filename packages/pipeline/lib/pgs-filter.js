// Unified PGS filtering logic for Asili
// Used during trait management to validate PGS scores before adding to catalog

const EXCLUDED_PGS_IDS = ['PGS002724']; // GIGASTROKE

const LEGITIMATE_NR_METHODS = [
  'sparssnp', 'snpnet', 'penalized regression', 'lasso', 'ridge regression',
  'elastic net', 'ldpred', 'ldpred2', 'prsice', 'lassosum', 'bigstatsr', 'bigsnpr'
];

const INTEGRATIVE_METHOD_KEYWORDS = [
  'integrative', 'meta-analysis', 'meta analysis', 'component', 'composite',
  'combined', 'ensemble', 'multi-trait', 'multitrait', 'cross-trait', 'crosstrait'
];

const WEIGHT_THRESHOLDS = {
  max_absolute: 100,
  min_variance: 0.001  // Detect suspiciously uniform weights
};

async function validateWeights(pgsId, pgsApiClient) {
  try {
    const fileContent = await pgsApiClient.getPGSFile(pgsId);
    const lines = fileContent.split('\n').filter(l => l && !l.startsWith('#'));
    if (lines.length < 2) return { valid: true };
    
    const weights = lines.slice(1, Math.min(1001, lines.length))
      .map(l => parseFloat(l.split('\t')[5]))
      .filter(w => !isNaN(w));
    
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
    if (variance < WEIGHT_THRESHOLDS.min_variance && Math.abs(mean) > 10) {
      return { valid: false, reason: `Suspicious uniform weights: mean=${mean.toFixed(2)}, variance=${variance.toFixed(6)}` };
    }
    
    return { valid: true };
  } catch (error) {
    return { valid: true }; // Don't exclude if we can't validate
  }
}

async function shouldExcludePGS(pgsId, scoreData, pgsApiClient = null) {
  if (EXCLUDED_PGS_IDS.includes(pgsId)) {
    return { exclude: true, reason: 'Known integrative PGS' };
  }
  
  const methodName = (scoreData.method_name || '').toLowerCase();
  const weightType = scoreData.weight_type || '';
  
  for (const keyword of INTEGRATIVE_METHOD_KEYWORDS) {
    if (methodName.includes(keyword)) {
      return { exclude: true, reason: `Integrative method: ${keyword}` };
    }
  }
  
  if (weightType === 'NR') {
    for (const legitMethod of LEGITIMATE_NR_METHODS) {
      if (methodName.includes(legitMethod)) {
        return { exclude: false, reason: `Legitimate modern method: ${legitMethod}` };
      }
    }
    if (!methodName || methodName.trim() === '') {
      return { exclude: true, reason: 'No method specified with NR weight type' };
    }
    return { exclude: false, reason: 'NR weight type but method specified' };
  }
  
  // Validate actual weights if API client provided
  if (pgsApiClient) {
    const weightCheck = await validateWeights(pgsId, pgsApiClient);
    if (!weightCheck.valid) {
      return { exclude: true, reason: weightCheck.reason };
    }
  }
  
  return { exclude: false, reason: 'Standard PGS score' };
}

export { shouldExcludePGS, EXCLUDED_PGS_IDS, LEGITIMATE_NR_METHODS, INTEGRATIVE_METHOD_KEYWORDS };
