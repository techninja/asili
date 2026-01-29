# PGS Exclusion Guide

This document explains why certain Polygenic Scores (PGS) are excluded from Asili's trait catalog and potential approaches to utilize them in the future. We're at 32% PGS coverage right now, if we're looking for more coverage this is a great place to start looking to improve things.

## Overview

The PGS Catalog contains thousands of scores, but not all are compatible with Asili's z-score based risk calculation system. Excluded PGS are tracked in each trait's `excluded_pgs` array with detailed reasons.

## Exclusion Categories

### 1. Weight Type Not Reported (NR)

**Problem**: PGS with `weight_type: "NR"` use undocumented or non-standard scoring scales that cannot be normalized with other scores.

**Example**:
```json
{
  "pgs_id": "PGS000021",
  "reason": "Weight type not reported (NR) - incompatible scale",
  "method": "SNP associations curated from the literature",
  "weight_type": "NR"
}
```

**Why Excluded**: 
- Cannot calculate theoretical population distribution (mean/std)
- Z-scores would be incomparable across PGS
- Often legacy scores from early GWAS studies

**Potential Solutions**:
- **Empirical Calibration**: Use large reference populations (1000 Genomes, UK Biobank) to calculate empirical mean/std
- **Separate Display**: Show NR scores in a separate "uncalibrated" section without z-scores
- **Score Conversion**: Contact original authors for conversion formulas to standard scales

**Affected Traits**: Type 1 diabetes (6 PGS), Type 2 diabetes (7 PGS), many legacy traits

---

### 2. Incompatible Scale (Extreme Mean/Std Ratio)

**Problem**: PGS with `|mean/std| > 20` use different units (e.g., age in months, raw counts) that create extreme z-scores.

**Example**:
```json
{
  "pgs_id": "PGS002480",
  "reason": "Incompatible scale: mean/std ratio = 21.9",
  "method": "Pruning and Thresholding (P+T)",
  "weight_type": "beta",
  "norm_mean": -1168.82,
  "norm_sd": 53.35
}
```

**Why Excluded**:
- Creates z-scores in the hundreds or thousands
- Dominates trait-level averages, making them meaningless
- Often measures continuous traits (age, height) in raw units

**Potential Solutions**:
- **Unit Detection**: Automatically detect and convert units (months→years, cm→meters)
- **Score Standardization**: Re-standardize to mean=0, std=1 before use
- **Trait-Specific Handling**: For age/height traits, display raw predictions instead of z-scores

**Affected Traits**: Age at menarche (3 PGS), Type 2 diabetes (4 PGS), height-related traits

---

### 3. Zero Variance Weights

**Problem**: All variant weights are identical (variance < 0.001), indicating failed model training or data issues.

**Example**:
```json
{
  "pgs_id": "PGS001817",
  "reason": "Zero variance weights (all identical): mean=0.00",
  "method": "Penalized regression (bigstatsr)",
  "weight_type": "beta"
}
```

**Why Excluded**:
- Provides no discriminatory power (all individuals get same score)
- Usually indicates model convergence failure
- Cannot calculate meaningful z-scores

**Potential Solutions**:
- **Re-training**: Contact authors or re-train model with proper parameters
- **Alternative Methods**: Use different PGS for same trait from same publication
- **Data Validation**: Check if harmonized vs original scoring files differ

**Affected Traits**: Type 1 diabetes (12 PGS), most traits with modern methods (LDpred2, PRS-CS)

---

### 4. Integrative/Ensemble Methods

**Problem**: Meta-scores combining multiple PGS create circular dependencies and inflate correlations.

**Example**:
```json
{
  "pgs_id": "PGS004162",
  "reason": "Integrative method: ensemble",
  "method": "UKBB-EUR.MultiPRS.CV",
  "weight_type": "beta"
}
```

**Why Excluded**:
- Double-counts information if component PGS are also included
- Optimized for specific populations (usually UK Biobank EUR)
- Cannot decompose into individual variant contributions

**Potential Solutions**:
- **Exclusive Use**: Include ensemble OR components, never both
- **Meta-Analysis Display**: Show ensemble as "combined score" with component breakdown
- **Population Matching**: Only use if user's ancestry matches training population

**Affected Traits**: Most traits with comprehensive PGS coverage

---

## Statistics

Across the trait catalog:

- **Total PGS Available**: ~15,000
- **Excluded (NR weight type)**: ~35%
- **Excluded (Zero variance)**: ~25%
- **Excluded (Integrative)**: ~5%
- **Excluded (Incompatible scale)**: ~3%
- **Usable PGS**: ~32%

## Implementation Details

### Filter Logic (`packages/pipeline/lib/pgs-filter.js`)

```javascript
// Exclusion order:
1. Integrative methods (keyword matching)
2. Weight type NR (incompatible scale)
3. Zero variance weights (validation)
4. Extreme mean/std ratio (>20)
```

### Frontend Handling (`apps/web/components/risk-dashboard.js`)

```javascript
// Additional runtime filtering:
- Filter PGS with |mean/std| > 20
- Filter PGS with weight_type === 'NR'
- Use median z-score (robust to outliers)
```

## Future Enhancements

### Short Term
1. **Empirical Calibration Pipeline**: Calculate mean/std from reference populations for NR scores
2. **Unit Conversion**: Detect and convert common units (age, height, BMI)
3. **Separate NR Display**: Show uncalibrated scores with raw values only

### Medium Term
1. **Population-Specific Normalization**: Calculate mean/std per ancestry group
2. **Score Re-standardization**: Transform all scores to common scale (mean=0, std=1)
3. **Ensemble Decomposition**: Extract component PGS from meta-scores

### Long Term
1. **Active Learning**: Re-train failed models with user data
2. **Cross-Trait Calibration**: Use genetic correlations to calibrate across traits
3. **Bayesian Integration**: Combine incompatible scores using hierarchical models

## Contributing

If you have expertise in PGS methodology and want to help recover excluded scores:

1. **Empirical Calibration**: Provide reference population data
2. **Unit Conversion**: Document trait-specific units and conversions
3. **Model Re-training**: Share improved training pipelines
4. **Validation**: Test proposed solutions on held-out populations

See [CONTRIBUTING.md](../../CONTRIBUTING.md) for details.

## References

- PGS Catalog: https://www.pgscatalog.org/
- Weight Type Standards: https://www.pgscatalog.org/docs/
- Normalization Methods: Lambert et al. (2021) Nature Genetics
- Z-Score Interpretation: Wald et al. (2021) JAMA Cardiology
