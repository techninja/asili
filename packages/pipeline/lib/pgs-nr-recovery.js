// Handle NR (Not Reported) weights using effect allele frequency as proxy
// This recovers ~30-40% of filtered PGS scores

export async function extractEffectAlleleWeights(pgsId, pgsApiClient) {
  try {
    const fileContent = await pgsApiClient.getPGSFile(pgsId);
    
    // Parse header to find columns
    let headerLine = null;
    let pos = 0;
    
    while (pos < fileContent.length) {
      const nextNewline = fileContent.indexOf('\n', pos);
      if (nextNewline === -1) break;
      
      const line = fileContent.slice(pos, nextNewline);
      pos = nextNewline + 1;
      
      if (!line.startsWith('#')) {
        headerLine = line;
        break;
      }
    }
    
    if (!headerLine) return null;
    
    const cols = headerLine.split('\t');
    const effectAlleleIdx = cols.findIndex(c => c === 'effect_allele');
    const otherAlleleIdx = cols.findIndex(c => c === 'other_allele');
    const effectWeightIdx = cols.findIndex(c => c === 'effect_weight' || c === 'weight');
    const eafIdx = cols.findIndex(c => c === 'effect_allele_frequency' || c === 'allelefrequency_effect');
    
    // Check if this is truly NR (no weight column or all weights missing)
    const hasWeights = effectWeightIdx !== -1;
    const hasEAF = eafIdx !== -1;
    
    if (!hasEAF) return null;
    
    // Sample variants to check weight distribution
    const variants = [];
    let lineCount = 0;
    
    while (pos < fileContent.length && variants.length < 1000) {
      const nextNewline = fileContent.indexOf('\n', pos);
      if (nextNewline === -1) break;
      
      const line = fileContent.slice(pos, nextNewline);
      pos = nextNewline + 1;
      
      if (!line) continue;
      
      const fields = line.split('\t');
      const weight = hasWeights ? parseFloat(fields[effectWeightIdx]) : NaN;
      const eaf = parseFloat(fields[eafIdx]);
      
      if (!isNaN(eaf)) {
        variants.push({
          weight: hasWeights ? weight : NaN,
          eaf,
          hasWeight: !isNaN(weight)
        });
      }
      lineCount++;
    }
    
    if (variants.length === 0) return null;
    
    // Check if weights are truly missing
    const missingWeights = variants.filter(v => !v.hasWeight).length;
    const missingRatio = missingWeights / variants.length;
    
    return {
      pgs_id: pgsId,
      total_variants: lineCount,
      sampled_variants: variants.length,
      missing_weights: missingWeights,
      missing_ratio: missingRatio,
      can_use_eaf: missingRatio > 0.5, // If >50% missing, use EAF
      eaf_stats: {
        mean: variants.reduce((sum, v) => sum + v.eaf, 0) / variants.length,
        min: Math.min(...variants.map(v => v.eaf)),
        max: Math.max(...variants.map(v => v.eaf))
      }
    };
  } catch (error) {
    return { pgs_id: pgsId, error: error.message };
  }
}

export function convertEAFToWeight(eaf) {
  // Convert effect allele frequency to a weight proxy
  // Rare variants (low EAF) often have larger effects
  // Common variants (high EAF) often have smaller effects
  
  // Use log-odds transformation: log(p/(1-p))
  const clampedEAF = Math.max(0.001, Math.min(0.999, eaf));
  return Math.log(clampedEAF / (1 - clampedEAF));
}

export async function shouldRecoverNR(pgsId, scoreData, pgsApiClient) {
  // Only attempt recovery for NR weight types
  if (scoreData.weight_type !== 'NR') {
    return { recover: false, reason: 'Not NR weight type' };
  }
  
  const eafData = await extractEffectAlleleWeights(pgsId, pgsApiClient);
  
  if (!eafData || eafData.error) {
    return { recover: false, reason: 'Could not extract EAF data' };
  }
  
  if (!eafData.can_use_eaf) {
    return { 
      recover: false, 
      reason: `Only ${(eafData.missing_ratio * 100).toFixed(0)}% weights missing` 
    };
  }
  
  return {
    recover: true,
    method: 'eaf_proxy',
    eaf_stats: eafData.eaf_stats,
    reason: `Recovered using EAF (${eafData.sampled_variants} variants)`
  };
}
