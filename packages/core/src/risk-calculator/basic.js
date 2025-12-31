/**
 * Basic polygenic risk score calculator
 * Implements standard PGS calculation algorithms
 */

import { RiskCalculator } from '../interfaces/genomic.js';

export class BasicRiskCalculator extends RiskCalculator {
  constructor(config = {}) {
    super(config);
    this.populationMean = config.populationMean || 0;
    this.populationStd = config.populationStd || 1;
  }

  async calculateRisk(dna, trait, pgsData) {
    // Match variants between DNA data and PGS data
    const matches = this._matchVariants(dna, pgsData);
    
    // Calculate raw polygenic score
    const rawScore = this._calculateRawScore(matches);
    
    // Normalize and calculate percentile
    const normalizedScore = this._normalizeScore(rawScore);
    const percentile = this._calculatePercentile(normalizedScore);
    
    return {
      traitId: trait.id,
      score: rawScore,
      percentile,
      interpretation: this._interpretPercentile(percentile),
      metadata: {
        variantsMatched: matches.length,
        totalPgsVariants: pgsData.variants?.length || 0,
        totalDnaVariants: dna.variants.length,
        normalizedScore,
        calculatedAt: new Date().toISOString()
      }
    };
  }

  _matchVariants(dna, pgsData) {
    const matches = [];
    const dnaMap = new Map();
    
    // Create lookup map for DNA variants
    for (const variant of dna.variants) {
      const key = this._getVariantKey(variant);
      dnaMap.set(key, variant);
    }
    
    // Match PGS variants with DNA data
    for (const pgsVariant of pgsData.variants || []) {
      const key = this._getVariantKey(pgsVariant);
      const dnaVariant = dnaMap.get(key);
      
      if (dnaVariant) {
        matches.push({
          pgs: pgsVariant,
          dna: dnaVariant,
          effectWeight: pgsVariant.effectWeight || 0,
          dosage: this._calculateDosage(dnaVariant, pgsVariant)
        });
      }
    }
    
    return matches;
  }

  _getVariantKey(variant) {
    // Create unique key for variant matching
    if (variant.rsid) {
      return `rsid:${variant.rsid}`;
    }
    if (variant.chr_name && variant.chr_position) {
      return `pos:${variant.chr_name}:${variant.chr_position}`;
    }
    if (variant.variant_id) {
      return `id:${variant.variant_id}`;
    }
    return null;
  }

  _calculateDosage(dnaVariant, pgsVariant) {
    // Calculate allele dosage (0, 1, or 2 copies of effect allele)
    const genotype = dnaVariant.genotype || '';
    const effectAllele = pgsVariant.effectAllele || pgsVariant.effect_allele;
    
    if (!effectAllele || !genotype) return 0;
    
    const alleles = genotype.split('');
    return alleles.filter(allele => allele === effectAllele).length;
  }

  _calculateRawScore(matches) {
    return matches.reduce((sum, match) => {
      return sum + (match.effectWeight * match.dosage);
    }, 0);
  }

  _normalizeScore(rawScore) {
    // Z-score normalization
    return (rawScore - this.populationMean) / this.populationStd;
  }

  _calculatePercentile(normalizedScore) {
    // Convert z-score to percentile using normal distribution approximation
    const z = Math.abs(normalizedScore);
    let percentile;
    
    if (z < 1) {
      percentile = 50 + (z * 34.13);
    } else if (z < 2) {
      percentile = 84.13 + ((z - 1) * 13.59);
    } else if (z < 3) {
      percentile = 97.72 + ((z - 2) * 2.14);
    } else {
      percentile = 99.87;
    }
    
    // Adjust for negative scores
    if (normalizedScore < 0) {
      percentile = 100 - percentile;
    }
    
    return Math.round(Math.max(1, Math.min(99, percentile)));
  }

  _interpretPercentile(percentile) {
    if (percentile >= 95) return 'Very high risk';
    if (percentile >= 80) return 'High risk';
    if (percentile >= 60) return 'Elevated risk';
    if (percentile >= 40) return 'Average risk';
    if (percentile >= 20) return 'Below average risk';
    if (percentile >= 5) return 'Low risk';
    return 'Very low risk';
  }
}