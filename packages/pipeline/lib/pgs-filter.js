// Unified PGS filtering logic for Asili
// Used during trait management to validate PGS scores before adding to catalog

const LEGITIMATE_NR_METHODS = [
  'sparssnp', 'snpnet', 'penalized regression', 'lasso', 'ridge regression',
  'elastic net', 'ldpred', 'ldpred2', 'prsice', 'lassosum', 'bigstatsr', 'bigsnpr'
];

const INTEGRATIVE_METHOD_KEYWORDS = [
  'integrative', 'meta-analysis', 'meta analysis', 'component', 'composite',
  'combined', 'ensemble', 'multi-trait', 'multitrait', 'cross-trait', 'crosstrait',
  'linear weight combination', 'weighted combination'
];

const WEIGHT_THRESHOLDS = {
  max_absolute: 100,
  min_variance: 0.001  // Detect suspiciously uniform weights
};

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
    
    return { valid: true };
  } catch (error) {
    return { valid: true }; // Don't exclude if we can't validate
  }
}

async function shouldExcludePGS(pgsId, scoreData, pgsApiClient = null) {
  const methodName = (scoreData.method_name || '').toLowerCase();
  const methodParams = (scoreData.method_params || '').toLowerCase();
  const weightType = scoreData.weight_type || '';
  
  for (const keyword of INTEGRATIVE_METHOD_KEYWORDS) {
    if (methodName.includes(keyword) || methodParams.includes(keyword)) {
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

export { shouldExcludePGS, LEGITIMATE_NR_METHODS, INTEGRATIVE_METHOD_KEYWORDS };
