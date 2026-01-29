/**
 * Shared risk calculation logic for both browser and server
 * Ensures consistent PGS calculations across platforms
 */

import { Debug } from '../utils/debug.js';

export class SharedRiskCalculator {
  constructor(normalizationParams = {}) {
    this.pgsBreakdown = new Map();
    this.pgsDetails = new Map();
    this.totalMatches = 0;
    this.totalScore = 0;
    this.normalizationParams = normalizationParams;
  }

  /**
   * Create DNA lookup maps for efficient variant matching
   */
  createDNALookup(userDNA) {
    const dnaLookup = new Map();
    
    userDNA.forEach(variant => {
      // Store the full variant object for lookup
      // Add rsID lookup
      if (variant.rsid) {
        dnaLookup.set(variant.rsid, variant);
      }
      
      // Add position-based lookups (chr:pos format)
      if (variant.chromosome && variant.position) {
        dnaLookup.set(`${variant.chromosome}:${variant.position}`, variant);
      }
      
      // Add full variant ID lookups (chr:pos:allele1:allele2 format)
      if (variant.chromosome && variant.position && variant.allele1 && variant.allele2) {
        dnaLookup.set(`${variant.chromosome}:${variant.position}:${variant.allele1}:${variant.allele2}`, variant);
        dnaLookup.set(`${variant.chromosome}:${variant.position}:${variant.allele2}:${variant.allele1}`, variant);
      }
    });
    
    return dnaLookup;
  }

  /**
   * Initialize a PGS if it doesn't exist
   */
  initializePGS(pgsId, metadata = {}) {
    if (!this.pgsBreakdown.has(pgsId)) {
      this.pgsBreakdown.set(pgsId, {
        positive: 0,
        negative: 0,
        positiveSum: 0,
        negativeSum: 0,
        total: 0
      });

      this.pgsDetails.set(pgsId, {
        score: 0,
        matchedVariants: 0,
        metadata: {
          ...metadata,
          mean: metadata.norm_mean ?? metadata.mean,
          std: metadata.norm_sd ?? metadata.std,
          weight_type: metadata.weight_type,
          method: metadata.method
        },
        topVariants: []
      });
    }
  }

  /**
   * Process a single variant and update PGS scores
   */
  processVariant(variantRow, dnaLookup, pgsMetadata = {}) {
    // Try multiple lookup strategies like the browser does
    let variant = dnaLookup.get(variantRow.variant_id);
    
    // If direct lookup fails, try position-based lookup
    if (!variant && variantRow.variant_id.includes(':')) {
      const parts = variantRow.variant_id.split(':');
      if (parts.length >= 2) {
        const posKey = `${parts[0]}:${parts[1]}`;
        variant = dnaLookup.get(posKey);
      }
    }
    
    if (!variant) return false;

    const pgsId = variantRow.pgs_id;
    const effectWeight = parseFloat(variantRow.effect_weight) || 0;
    
    // Count how many copies of the effect allele the user has
    let effectAlleleCount = 0;
    if (variant.allele1 === variantRow.effect_allele) effectAlleleCount++;
    if (variant.allele2 === variantRow.effect_allele) effectAlleleCount++;
    
    // Only count as a match and add to PGS scores if user has effect alleles
    if (effectAlleleCount > 0) {
      // Initialize PGS if needed
      this.initializePGS(pgsId, pgsMetadata[pgsId] || {});
      
      // Calculate the contribution (effect weight * number of effect alleles)
      const contribution = effectWeight * effectAlleleCount;
      
      const breakdown = this.pgsBreakdown.get(pgsId);
      const details = this.pgsDetails.get(pgsId);
      
      // Count positive and negative contributions
      if (contribution > 0) {
        breakdown.positive += 1;
        breakdown.positiveSum += contribution;
      } else if (contribution < 0) {
        breakdown.negative += 1;
        breakdown.negativeSum += contribution;
      }
      
      breakdown.total += 1;
      details.score += contribution;
      details.matchedVariants += 1;
      this.totalScore += contribution;
      this.totalMatches++; // Only count matches that contribute
      
      // Store top variants for detailed view
      this.addTopVariant(pgsId, {
        rsid: variantRow.variant_id,
        effect_allele: variantRow.effect_allele,
        effect_weight: effectWeight,
        userGenotype: `${variant.allele1}${variant.allele2}`,
        chromosome: variant.chromosome,
        contribution: contribution
      });
      
      return true;
    }
    
    return false; // No contribution
  }

  /**
   * Add variant to top variants list, maintaining only top 20 by effect weight
   */
  addTopVariant(pgsId, variantData) {
    const details = this.pgsDetails.get(pgsId);
    if (!details) return;
    
    if (details.topVariants.length < 20) {
      details.topVariants.push(variantData);
    } else {
      // Replace lowest impact variant if this one is higher
      const minIndex = details.topVariants.reduce(
        (minIdx, curr, idx, arr) =>
          Math.abs(curr.effect_weight) < Math.abs(arr[minIdx].effect_weight)
            ? idx
            : minIdx,
        0
      );
      
      if (Math.abs(variantData.effect_weight) > Math.abs(details.topVariants[minIndex].effect_weight)) {
        details.topVariants[minIndex] = variantData;
      }
    }
  }

  /**
   * Finalize results and return formatted output with proper normalization
   */
  finalize() {
    let totalScore = 0;
    let totalWeightedZScore = 0;
    let totalWeight = 0;
    
    // Initialize any PGS from normalizationParams that weren't matched
    for (const pgsId in this.normalizationParams) {
      this.initializePGS(pgsId, this.normalizationParams[pgsId]);
    }
    
    for (const [pgsId, details] of this.pgsDetails.entries()) {
      totalScore += details.score;
      
      // Apply theoretical distribution normalization if available
      // Check both metadata and normalizationParams for backwards compatibility
      const metadata = details.metadata || {};
      const normParams = this.normalizationParams[pgsId] || {};
      
      const mean = metadata.mean ?? metadata.norm_mean ?? normParams.norm_mean;
      const sd = metadata.std ?? metadata.norm_sd ?? normParams.norm_sd;
      
      if (mean !== undefined && sd !== undefined && sd !== null && sd !== 0) {
        details.zScore = SharedRiskCalculator.calculateZScore(
          details.score,
          { mean, sd }
        );
        details.percentile = SharedRiskCalculator.calculatePercentile(details.zScore);
        
        // Weight by number of matched variants for overall z-score
        const weight = details.matchedVariants || 1;
        totalWeightedZScore += details.zScore * weight;
        totalWeight += weight;
      } else {
        details.zScore = null;
        details.percentile = null;
      }
    }
    
    // Calculate overall z-score as weighted average of PGS z-scores
    const overallZScore = totalWeight > 0 ? totalWeightedZScore / totalWeight : null;
    
    // Sort top variants for each PGS by effect weight magnitude
    for (const details of this.pgsDetails.values()) {
      if (details.topVariants) {
        details.topVariants.sort(
          (a, b) => Math.abs(b.effect_weight) - Math.abs(a.effect_weight)
        );
      }
    }
    
    return {
      riskScore: totalScore,
      zScore: overallZScore,
      totalMatches: this.totalMatches,
      pgsBreakdown: Object.fromEntries(this.pgsBreakdown),
      pgsDetails: Object.fromEntries(this.pgsDetails),
      calculatedAt: new Date().toISOString()
    };
  }

  /**
   * Calculate z-score from raw score using empirical distribution
   */
  static calculateZScore(rawScore, empiricalStats) {
    if (!empiricalStats || !empiricalStats.mean || !empiricalStats.sd) return null;
    return (rawScore - empiricalStats.mean) / empiricalStats.sd;
  }

  /**
   * Calculate percentile from z-score using normal CDF approximation
   */
  static calculatePercentile(zScore) {
    if (zScore === null || zScore === undefined) return null;
    
    // Approximation of error function for normal CDF
    const erf = (x) => {
      const sign = x >= 0 ? 1 : -1;
      x = Math.abs(x);
      const a1 = 0.254829592;
      const a2 = -0.284496736;
      const a3 = 1.421413741;
      const a4 = -1.453152027;
      const a5 = 1.061405429;
      const p = 0.3275911;
      const t = 1.0 / (1.0 + p * x);
      const y = 1.0 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);
      return sign * y;
    };
    
    return 0.5 * (1 + erf(zScore / Math.sqrt(2))) * 100;
  }

  /**
   * Clean up resources
   */
  cleanup() {
    this.pgsBreakdown.clear();
    this.pgsDetails.clear();
    this.totalMatches = 0;
    this.totalScore = 0;
  }
}