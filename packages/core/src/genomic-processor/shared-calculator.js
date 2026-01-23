/**
 * Shared risk calculation logic for both browser and server
 * Ensures consistent PGS calculations across platforms
 */

import { Debug } from '../utils/debug.js';

export class SharedRiskCalculator {
  constructor(normalizationParams = {}) {
    this.pgsBreakdown = new Map();
    this.pgsDetails = new Map();
    this.normalizationParams = normalizationParams; // { pgsId: { norm_mean, norm_sd } }
    this.totalMatches = 0;
    this.totalScore = 0;
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
        metadata,
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
        userGenotype: `${variant.allele1}${variant.allele2}`
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
   * Finalize results and return formatted output
   */
  finalize() {
    // Apply normalization to each PGS score
    let normalizedTotal = 0;
    let normalizedCount = 0;
    let rawTotal = 0;
    
    for (const [pgsId, details] of this.pgsDetails.entries()) {
      const params = this.normalizationParams[pgsId];
      if (params && params.norm_sd && params.norm_sd > 0) {
        // Apply z-score normalization: z = (raw - mean) / sd
        details.normalized_score = (details.score - params.norm_mean) / params.norm_sd;
        normalizedTotal += details.normalized_score;
        normalizedCount++;
      } else {
        // No normalization params - keep raw score but don't add to normalized total
        details.normalized_score = null;
      }
      rawTotal += details.score;
    }
    
    // Sort top variants for each PGS by effect weight magnitude
    for (const details of this.pgsDetails.values()) {
      if (details.topVariants) {
        details.topVariants.sort(
          (a, b) => Math.abs(b.effect_weight) - Math.abs(a.effect_weight)
        );
      }
    }

    // Use normalized total if we have normalization params, otherwise use raw total
    const finalScore = normalizedCount > 0 ? normalizedTotal : rawTotal;
    
    return {
      riskScore: finalScore,
      rawScore: rawTotal,
      normalizedScore: normalizedCount > 0 ? normalizedTotal : null,
      normalizedCount,
      totalMatches: this.totalMatches,
      pgsBreakdown: Object.fromEntries(this.pgsBreakdown),
      pgsDetails: Object.fromEntries(this.pgsDetails),
      calculatedAt: new Date().toISOString()
    };
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