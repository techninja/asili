// Enhanced PGS filtering using performance metrics and NR recovery
import { shouldExcludePGS as originalFilter } from './pgs-filter.js';
import { getPerformanceMetrics, calculatePerformanceWeight } from './pgs-performance.js';
import { shouldRecoverNR } from './pgs-nr-recovery.js';

export async function enhancedPGSFilter(pgsId, scoreData, pgsApiClient) {
  // First check original filters (integrative methods, extreme weights, etc.)
  const originalResult = await originalFilter(pgsId, scoreData, pgsApiClient);
  
  // If original filter says exclude for non-NR reasons, respect that
  if (originalResult.exclude && !scoreData.weight_type?.includes('NR')) {
    return {
      include: false,
      reason: originalResult.reason,
      strategy: 'original_filter'
    };
  }
  
  // Try to recover NR scores using EAF
  if (scoreData.weight_type === 'NR') {
    const recoveryResult = await shouldRecoverNR(pgsId, scoreData, pgsApiClient);
    
    if (recoveryResult.recover) {
      // Check performance metrics to validate recovery
      const perfMetrics = await getPerformanceMetrics(pgsId, pgsApiClient);
      const perfWeight = calculatePerformanceWeight(perfMetrics);
      
      return {
        include: perfWeight >= 0.3, // Only recover if validated
        reason: recoveryResult.reason,
        strategy: 'nr_recovery',
        weight_proxy: 'eaf',
        performance_weight: perfWeight,
        performance_metrics: perfMetrics
      };
    }
  }
  
  // For scores that passed original filter, add performance weighting
  if (!originalResult.exclude) {
    const perfMetrics = await getPerformanceMetrics(pgsId, pgsApiClient);
    const perfWeight = calculatePerformanceWeight(perfMetrics);
    
    return {
      include: true,
      reason: 'Standard PGS with validation',
      strategy: 'standard',
      performance_weight: perfWeight,
      performance_metrics: perfMetrics
    };
  }
  
  // Default: exclude
  return {
    include: false,
    reason: originalResult.reason,
    strategy: 'excluded'
  };
}

export async function analyzeTraitPGSQuality(traitId, pgsIds, pgsApiClient) {
  const results = {
    trait_id: traitId,
    total_pgs: pgsIds.length,
    included: [],
    excluded: [],
    recovered_nr: [],
    performance_summary: {
      validated: 0,
      unvalidated: 0,
      avg_weight: 0
    }
  };
  
  for (const pgsId of pgsIds) {
    try {
      const scoreData = await pgsApiClient.getScore(pgsId);
      const filterResult = await enhancedPGSFilter(pgsId, scoreData, pgsApiClient);
      
      const entry = {
        pgs_id: pgsId,
        weight_type: scoreData.weight_type,
        method: scoreData.method_name,
        variants: scoreData.variants_number,
        ...filterResult
      };
      
      if (filterResult.include) {
        results.included.push(entry);
        
        if (filterResult.strategy === 'nr_recovery') {
          results.recovered_nr.push(entry);
        }
        
        if (filterResult.performance_metrics?.has_validation) {
          results.performance_summary.validated++;
        } else {
          results.performance_summary.unvalidated++;
        }
        
        results.performance_summary.avg_weight += (filterResult.performance_weight || 0.5);
      } else {
        results.excluded.push(entry);
      }
    } catch (error) {
      results.excluded.push({
        pgs_id: pgsId,
        reason: `Error: ${error.message}`,
        strategy: 'error'
      });
    }
  }
  
  if (results.included.length > 0) {
    results.performance_summary.avg_weight /= results.included.length;
  }
  
  return results;
}
